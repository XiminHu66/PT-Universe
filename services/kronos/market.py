"""Resolve the market calendar and validate completed Yahoo daily bars."""
import json
import re
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

import exchange_calendars as calendars
import numpy as np
import pandas as pd

SYMBOL = re.compile(r'\^?[A-Z0-9][A-Z0-9.=-]{0,14}', re.ASCII)
CRYPTO = re.compile(r'[A-Z0-9]+-(USD|EUR|GBP|CAD|JPY|AUD|BTC|ETH|USDT|USDC)')
EXCHANGES = {
    'HK': 'XHKG', 'TO': 'XTSE', 'V': 'XTSE', 'L': 'XLON', 'T': 'XTKS', 'SS': 'XSHG', 'SZ': 'XSHG',
    'KS': 'XKRX', 'KQ': 'XKRX', 'AS': 'XAMS', 'PA': 'XPAR', 'DE': 'XETR', 'SW': 'XSWX',
    'AX': 'XASX', 'TW': 'XTAI', 'TWO': 'XTAI', 'SI': 'XSES', 'NS': 'XNSE', 'BO': 'XBOM',
    'SA': 'BVMF', 'MX': 'XMEX', 'ST': 'XSTO', 'CO': 'XCSE', 'HE': 'XHEL', 'OL': 'XOSL',
    'MI': 'XMIL', 'MC': 'XMAD', 'BR': 'XBRU', 'VI': 'XWBO',
}
INDEXES = {'^HSI': 'XHKG', '^N225': 'XTKS', '^FTSE': 'XLON', '^GDAXI': 'XETR', '^FCHI': 'XPAR', '^GSPTSE': 'XTSE'}
PRICE = ['open', 'high', 'low', 'close']
BARS = PRICE + ['volume']
LOOKBACK, MIN_HISTORY, HORIZON = 250, 60, 10


class HistoryError(ValueError):
    """A bounded, user-facing explanation from the market data validator."""


def calendar_name(symbol):
    if CRYPTO.fullmatch(symbol):
        return '24/7'
    return INDEXES.get(symbol, EXCHANGES.get(symbol.rsplit('.', 1)[-1], 'XNYS'))


def exchange_calendar(symbol):
    name = calendar_name(symbol)
    if name not in calendars.get_calendar_names():
        raise HistoryError('该市场的交易日历暂不可用')
    return calendars.get_calendar(name)


def completed_session(symbol, now):
    instant = pd.Timestamp(now)
    if calendar_name(symbol) == '24/7':
        return (instant.tz_convert('UTC') - pd.Timedelta(minutes=20)).date() - pd.Timedelta(days=1)
    calendar = exchange_calendar(symbol)
    date = instant.tz_convert(calendar.tz).normalize().tz_localize(None)
    session = calendar.date_to_session(date, direction='previous')
    if instant < calendar.session_close(session) + pd.Timedelta(minutes=20):
        session = calendar.previous_session(session)
    return session.date()


def fetch(symbol, start, cutoff):
    query = urlencode({
        'period1': int(start.tz_localize('UTC').timestamp()),
        'period2': int((cutoff + pd.Timedelta(days=2)).tz_localize('UTC').timestamp()),
        'interval': '1d',
    })
    missing = 0
    for host in ('query1.finance.yahoo.com', 'query2.finance.yahoo.com'):
        url = f'https://{host}/v8/finance/chart/{quote(symbol, safe="")}?{query}'
        try:
            request = Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urlopen(request, timeout=15) as response:
                result = json.load(response)['chart']['result'][0]
            meta = result['meta']
            dates = pd.to_datetime(result['timestamp'], unit='s', utc=True)
            zone = 'UTC' if calendar_name(symbol) == '24/7' else meta['exchangeTimezoneName']
            dates = dates.tz_convert(zone).tz_localize(None).normalize()
            indicators = result['indicators']
            frame = pd.DataFrame(indicators['quote'][0], index=dates)
            frame['volume'] = frame.get('volume', 0)
            adjusted = indicators.get('adjclose', [{}])[0].get('adjclose')
            frame['adjclose'] = adjusted if adjusted is not None else frame.close
            return frame.loc[start:cutoff], meta.get('currency', 'USD')
        except HTTPError as error:
            missing += error.code == 404
        except (URLError, TimeoutError, ValueError, KeyError, TypeError, IndexError):
            pass
        time.sleep(1)
    if missing == 2:
        raise HistoryError('行情源找不到该标的')
    raise HistoryError('暂时无法取得完整日线，请稍后重试')


def prepare_history(frame, calendar, cutoff):
    if frame.index.has_duplicates:
        raise HistoryError('行情源返回了重复日期')
    sessions = calendar.sessions_in_range(frame.index.min(), cutoff) if len(frame) else []
    frame = frame.loc[frame.index.intersection(sessions), BARS + ['adjclose']].sort_index()
    prices = PRICE + ['adjclose']
    good = np.isfinite(frame[prices]).all(axis=1) & (frame[prices] > 0).all(axis=1)
    good &= (frame.high >= frame[['open', 'close', 'low']].max(axis=1)) & (frame.low <= frame[['open', 'close']].min(axis=1))
    frame = frame.loc[good].tail(LOOKBACK).copy()
    if len(frame) < MIN_HISTORY:
        raise HistoryError(f'完整日线不足 {MIN_HISTORY} 个交易日')
    if frame.index[-1] != cutoff:
        raise HistoryError('最近已收盘交易日的完整日线尚未到达')
    frame['volume'] = frame.volume.where(np.isfinite(frame.volume) & (frame.volume >= 0), 0)
    return frame
