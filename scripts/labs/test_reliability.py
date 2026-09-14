import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from reliability import due, source
from schedule import pending_targets, publication_pending
from refresh import refresh_target, read_data, write_data, TARGETS

NOW = datetime(2026, 9, 14, 17, 15, tzinfo=timezone.utc)  # Delayed to 10:15 Pacific.
NOW_TEXT = NOW.isoformat()
OLD = '2026-09-13T15:35:00+00:00'


def snapshot(key='companies', ok=True):
    return {key: [{'id': 'old-record'}], 'updatedAt': OLD,
            'sources': [{'id': 'a', 'name': 'a', 'ok': ok, 'lastSuccessAt': OLD}],
            'refresh': {'state': 'ok' if ok else 'error', 'lastCompleteAt': OLD}}


class SchedulingTests(unittest.TestCase):
    def test_delayed_start_still_runs(self):
        self.assertEqual(set(pending_targets(NOW, {})), set(TARGETS))

    def test_before_morning_skips(self):
        self.assertEqual(pending_targets(datetime(2026, 9, 14, 14, 35, tzinfo=timezone.utc), {}), [])

    def test_winter_time(self):
        self.assertEqual(pending_targets(datetime(2026, 12, 14, 15, 35, tzinfo=timezone.utc), {}), [])
        self.assertEqual(len(pending_targets(datetime(2026, 12, 14, 16, 35, tzinfo=timezone.utc), {})), 2)

    def test_success_deduplicates_only_that_dataset(self):
        healthy = {'refresh': {'state': 'ok', 'lastCompleteAt': NOW_TEXT}}
        self.assertEqual(pending_targets(NOW, {'financials': healthy}), ['events'])

    def test_same_day_failed_manual_refresh_still_retries(self):
        self.assertTrue(due({'refresh': {'state': 'partial', 'lastCompleteAt': NOW_TEXT}}, NOW))

    def test_force_runs_even_before_morning(self):
        self.assertEqual(len(pending_targets(datetime(2026, 9, 14, 10, tzinfo=timezone.utc), {}, True)), 2)

    def test_failed_deployment_is_detected_and_repaired(self):
        data = {'financials': {'updatedAt': NOW_TEXT, 'refresh': {'runId': 'new'}}}
        self.assertTrue(publication_pending(data, lambda _: {'updatedAt': OLD, 'refresh': {'runId': 'old'}}))
        self.assertFalse(publication_pending(data, lambda _: data['financials']))
        self.assertTrue(publication_pending(data, lambda _: (_ for _ in ()).throw(OSError('offline'))))


class RefreshTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.path = Path(self.directory.name) / 'data.json'
        self.addCleanup(self.directory.cleanup)

    def test_crash_retains_snapshot_and_success_timestamp(self):
        old = snapshot();write_data(self.path, old)
        def fail(*_): raise OSError('source down')
        data, ok = refresh_target('financials', {}, self.path, 1, collector=fail, clock=lambda: NOW)
        self.assertFalse(ok)
        self.assertEqual(data['companies'], old['companies'])
        self.assertEqual(data['updatedAt'], OLD)
        self.assertEqual(data['sources'][0]['lastSuccessAt'], OLD)
        self.assertEqual(data['refresh']['lastCompleteAt'], OLD)
        self.assertEqual(read_data(self.path)['refresh']['state'], 'error')

    def test_retry_only_failed_sources_and_keep_partial_progress(self):
        old = snapshot();old['sources'].append({'id': 'b', 'name': 'b', 'ok': True, 'lastSuccessAt': OLD})
        write_data(self.path, old);calls=[];waits=[]
        def collect(config, previous, now):
            calls.append(config.get('_onlySources'))
            data = copy.deepcopy(previous)
            if len(calls) == 1:
                data['companies'].append({'id': 'fresh-a'})
                data['sources'][0] = source(previous,'a','a','',now,True,1)
                data['sources'][1] = source(previous,'b','b','',now,False,error='temporary')
            else:
                self.assertIn({'id': 'fresh-a'}, previous['companies'])
                data['sources'][1] = source(previous,'b','b','',now,True,1)
            data['updatedAt'] = now
            return data
        data, ok = refresh_target('financials', {}, self.path, 3, collector=collect, clock=lambda: NOW, sleep=waits.append)
        self.assertTrue(ok);self.assertEqual(calls,[['a','b'],['b']]);self.assertEqual(waits,[20])
        self.assertEqual(data['refresh']['lastCompleteAt'], NOW_TEXT)

    def test_partial_failure_is_not_silently_successful(self):
        old = snapshot();write_data(self.path,old)
        def partial(_,previous,now):
            return {**previous,'updatedAt':now,'sources':[source(previous,'a','a','',now,True),source(previous,'b','b','',now,False,error='down')]}
        data, ok = refresh_target('financials',{},self.path,1,collector=partial,clock=lambda:NOW)
        self.assertFalse(ok);self.assertEqual(data['refresh']['state'],'partial')
        self.assertEqual(data['refresh']['lastCompleteAt'],OLD)
        self.assertEqual(data['updatedAt'],NOW_TEXT)

    def test_optional_sec_failure_does_not_block_yahoo_success(self):
        def collect(_,old,now):
            return {'companies':[{'id':'a'}],'updatedAt':now,'sources':[source(old,'a','a','',now,True),source(old,'sec','sec','',now,False,optional=True)]}
        data,ok=refresh_target('financials',{},self.path,1,collector=collect,clock=lambda:NOW)
        self.assertTrue(ok);self.assertEqual(data['refresh']['state'],'ok')

    def test_one_dataset_fails_other_dataset_still_publishes(self):
        def fail(*_):raise OSError('finance down')
        a,ok=refresh_target('financials',{},self.path,1,collector=fail,clock=lambda:NOW)
        other=self.path.with_name('events.json')
        def game(_,old,now):return {'events':[{'id':'fresh-event'}],'updatedAt':now,'sources':[source(old,'g','g','',now,True)]}
        b,game_ok=refresh_target('events',{},other,1,collector=game,clock=lambda:NOW)
        self.assertFalse(ok);self.assertTrue(game_ok)
        self.assertEqual(read_data(other)['events'][0]['id'],'fresh-event')

    def test_non_finite_payload_does_not_replace_good_snapshot(self):
        old=snapshot();write_data(self.path,old)
        def invalid(*_):return {**old,'companies':[{'revenue':float('nan')}]}
        data,ok=refresh_target('financials',{},self.path,1,collector=invalid,clock=lambda:NOW)
        self.assertFalse(ok);self.assertEqual(data['companies'],old['companies'])


if __name__=='__main__':unittest.main()
