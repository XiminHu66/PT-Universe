'use strict';

// This function is copied into a Safari bookmark. Keep it self-contained.
function jumpToLatestReportStart() {
  if (location.origin !== 'https://chatgpt.com'
    || !/^\/(?:g\/[\w-]+\/)?c\/[\w-]+\/?$/.test(location.pathname)) {
    alert('请先在 Safari 打开简报的 ChatGPT 原会话，再点此书签。');
    return;
  }
  const turnSelector = '[data-testid^="conversation-turn-"]';
  const assistantSelector = '[data-message-author-role="assistant"]';
  const thread = document.querySelector('main') || document.body;
  let lastCandidate = null;
  let settled = 0;
  let attempts = 0;

  function latestAssistant() {
    return [...thread.querySelectorAll(assistantSelector)].reverse()
      .find(message => message.getClientRects().length && message.innerText.trim());
  }

  function scrollContainer(node) {
    for (let element = node?.parentElement; element; element = element.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(element).overflowY)
        && element.scrollHeight > element.clientHeight + 2) return element;
    }
    return document.scrollingElement;
  }

  function locate() {
    const candidate = latestAssistant();
    const lastTurn = [...thread.querySelectorAll(turnSelector)].at(-1);
    const bottomButton = thread.querySelector(
      'button[data-testid="scroll-to-bottom-button"], button[aria-label="Scroll to bottom"], button[aria-label="滚动到底部"]'
    );
    const scroller = scrollContainer(lastTurn || candidate || thread.firstElementChild);
    const canJump = bottomButton?.getClientRects().length;
    const distance = scroller ? scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight : 0;
    if (canJump) bottomButton.click();
    else if (distance > 4) scroller.scrollTop = scroller.scrollHeight;
    settled = candidate && candidate === lastCandidate && !canJump && distance <= 4 ? settled + 1 : 0;
    lastCandidate = candidate;
    const generating = thread.querySelector('[data-testid="stop-button"]');
    if (settled >= 4 && !generating) {
      const target = candidate.closest(turnSelector) || candidate;
      target.scrollIntoView({ block: 'start' });
      return;
    }
    if (++attempts < 28) setTimeout(locate, 150);
    else alert('没有定位到稳定的最新回复。请等会话载入或生成结束后再点一次。');
  }
  locate();
}
