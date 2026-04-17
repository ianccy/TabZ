import { t, getLang, getAvailableLangs, saveLang } from './i18n.js';

const STORAGE_KEY = 'tutorialCompleted';

const STEPS = [
  { type: 'welcome' },
  { type: 'spotlight', targetId: 'btn-add-collection', titleKey: 'tutorial1Title', bodyKey: 'tutorial1Body' },
  { type: 'spotlight', targetSelector: '.open-tabs-sidebar', titleKey: 'tutorial2Title', bodyKey: 'tutorial2Body' },
  { type: 'info',      titleKey: 'tutorial3Title', bodyKey: 'tutorial3Body' },
  { type: 'spotlight', targetId: 'btn-link-folder', titleKey: 'tutorial4Title', bodyKey: 'tutorial4Body' },
  { type: 'spotlight', targetId: 'btn-sign-in',     titleKey: 'tutorial5Title', bodyKey: 'tutorial5Body' },
];

const TOTAL_STEPS = STEPS.length;

let root = null;
let currentStep = 0;
let resizeHandler = null;

export async function initTutorial() {
  const { tutorialCompleted } = await chrome.storage.local.get(STORAGE_KEY);
  if (!tutorialCompleted) startTutorial();
}

export function startTutorial() {
  currentStep = 0;
  mount();
  showStep(currentStep);
}

function mount() {
  if (root) root.remove();
  root = document.createElement('div');
  root.id = 'tutorial-root';
  root.classList.add('active');
  document.body.appendChild(root);

  resizeHandler = () => {
    if (currentStep > 0) showStep(currentStep);
  };
  window.addEventListener('resize', resizeHandler);
}

function unmount() {
  if (root) { root.remove(); root = null; }
  if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
}

async function finish() {
  await chrome.storage.local.set({ [STORAGE_KEY]: true });
  unmount();
}

function showStep(index) {
  root.innerHTML = '';
  const step = STEPS[index];

  if (step.type === 'welcome') {
    renderWelcome();
  } else if (step.type === 'info') {
    renderInfo(index, step);
  } else {
    const el = step.targetId
      ? document.getElementById(step.targetId)
      : document.querySelector(step.targetSelector);

    if (!el || el.hidden || el.offsetParent === null) {
      advance();
      return;
    }
    renderSpotlight(index, step, el);
  }
}

function renderWelcome() {
  const overlay = document.createElement('div');
  overlay.className = 'tutorial-welcome-overlay';

  const langs = getAvailableLangs();
  const langOptions = langs.map(({ code, label }) =>
    `<option value="${code}">${label}</option>`
  ).join('');

  const card = document.createElement('div');
  card.className = 'tutorial-welcome-card';
  card.innerHTML = `
    <div class="tutorial-lang-switcher">
      <select class="tutorial-lang-select" id="tutorial-lang-select">${langOptions}</select>
    </div>
    <div class="tutorial-welcome-icon">👋</div>
    <div class="tutorial-welcome-title">${t('tutorialWelcomeTitle')}</div>
    <div class="tutorial-welcome-body">${t('tutorialWelcomeBody')}</div>
    <div class="tutorial-welcome-actions">
      <button class="tutorial-btn-primary" id="tutorial-start-btn">${t('tutorialStart')}</button>
      <button class="tutorial-btn-skip" id="tutorial-skip-btn">${t('tutorialSkip')}</button>
    </div>
  `;

  overlay.appendChild(card);
  root.appendChild(overlay);

  const select = root.querySelector('#tutorial-lang-select');
  select.value = getLang();
  select.addEventListener('change', async () => {
    await saveLang(select.value);
    document.dispatchEvent(new CustomEvent('tabz:lang-changed'));
    showStep(0);
  });

  root.querySelector('#tutorial-start-btn').addEventListener('click', advance);
  root.querySelector('#tutorial-skip-btn').addEventListener('click', finish);
}

function renderInfo(index, step) {
  const overlay = document.createElement('div');
  overlay.className = 'tutorial-info-overlay';

  const card = document.createElement('div');
  card.className = 'tutorial-info-card';
  const isLast = index === TOTAL_STEPS - 1;
  card.innerHTML = `
    <div class="tutorial-info-step">STEP ${index} / ${TOTAL_STEPS - 1}</div>
    <div class="tutorial-info-title">${t(step.titleKey)}</div>
    <div class="tutorial-info-body">${t(step.bodyKey)}</div>
    <div class="tutorial-info-actions">
      <button class="tutorial-btn-skip" id="tutorial-skip-btn">${t('tutorialSkip')}</button>
      <button class="tutorial-btn-primary" id="tutorial-next-btn">${isLast ? t('tutorialDone') : t('tutorialNext')}</button>
    </div>
  `;

  overlay.appendChild(card);
  root.appendChild(overlay);
  renderDots(index);

  root.querySelector('#tutorial-next-btn').addEventListener('click', isLast ? finish : advance);
  root.querySelector('#tutorial-skip-btn').addEventListener('click', finish);
}

function renderSpotlight(index, step, el) {
  const pad = 8;
  const rect = el.getBoundingClientRect();
  const top = rect.top - pad;
  const left = rect.left - pad;
  const width = rect.width + pad * 2;
  const height = rect.height + pad * 2;

  const spotlight = document.createElement('div');
  spotlight.className = 'tutorial-spotlight';
  Object.assign(spotlight.style, {
    top: `${top}px`, left: `${left}px`,
    width: `${width}px`, height: `${height}px`,
  });
  root.appendChild(spotlight);

  const tooltip = document.createElement('div');
  tooltip.className = 'tutorial-tooltip';
  const isLast = index === TOTAL_STEPS - 1;
  tooltip.innerHTML = `
    <div class="tutorial-tooltip-step">STEP ${index} / ${TOTAL_STEPS - 1}</div>
    <div class="tutorial-tooltip-title">${t(step.titleKey)}</div>
    <div class="tutorial-tooltip-body">${t(step.bodyKey)}</div>
    <div class="tutorial-tooltip-actions">
      <button class="tutorial-btn-skip" id="tutorial-skip-btn">${t('tutorialSkip')}</button>
      <button class="tutorial-btn-primary" id="tutorial-next-btn">${isLast ? t('tutorialDone') : t('tutorialNext')}</button>
    </div>
  `;

  positionTooltip(tooltip, { top, left, width, height });
  root.appendChild(tooltip);
  renderDots(index);

  root.querySelector('#tutorial-next-btn').addEventListener('click', isLast ? finish : advance);
  root.querySelector('#tutorial-skip-btn').addEventListener('click', finish);
}

function positionTooltip(tooltip, rect) {
  const tipW = 220;
  const tipH = 160;
  const gap = 12;
  const vp = { w: window.innerWidth, h: window.innerHeight };

  const spaceBelow = vp.h - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const spaceRight = vp.w - (rect.left + rect.width);

  let tipTop, tipLeft, arrowClass;

  if (spaceBelow >= tipH + gap) {
    tipTop = rect.top + rect.height + gap;
    tipLeft = Math.min(rect.left, vp.w - tipW - 8);
    arrowClass = 'arrow-top';
  } else if (spaceAbove >= tipH + gap) {
    tipTop = rect.top - tipH - gap;
    tipLeft = Math.min(rect.left, vp.w - tipW - 8);
    arrowClass = 'arrow-bottom';
  } else if (spaceRight >= tipW + gap) {
    tipTop = Math.min(rect.top, vp.h - tipH - 8);
    tipLeft = rect.left + rect.width + gap;
    arrowClass = 'arrow-left';
  } else {
    tipTop = Math.min(rect.top, vp.h - tipH - 8);
    tipLeft = rect.left - tipW - gap;
    arrowClass = 'arrow-right';
  }

  tooltip.classList.add(arrowClass);
  Object.assign(tooltip.style, {
    top: `${Math.max(8, tipTop)}px`,
    left: `${Math.max(8, tipLeft)}px`,
  });
}

function renderDots(activeIndex) {
  const dots = document.createElement('div');
  dots.className = 'tutorial-dots';
  for (let i = 1; i < TOTAL_STEPS; i++) {
    const d = document.createElement('div');
    d.className = 'tutorial-dot' + (i === activeIndex ? ' active' : '');
    dots.appendChild(d);
  }
  root.appendChild(dots);
}

function advance() {
  currentStep++;
  if (currentStep >= TOTAL_STEPS) {
    finish();
  } else {
    showStep(currentStep);
  }
}
