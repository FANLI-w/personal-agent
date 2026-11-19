/** Client code for the desktop-owned DSH extension. Slot registrations follow
 * their declaring surfaces through mount and disposal, including new sessions. */
export function workbenchBrandClient(avatar: string) {
  return `
  const { jsx, jsxs } = loadDshModule('react/jsx-runtime');
  const mark = ({ size }) => jsx('img', {
    src: ${JSON.stringify(avatar)}, alt: '', width: size, height: size,
    style: { display: 'block', objectFit: 'contain' },
  });
  // The host header owns the wordmark. Keep DSH's native new-session and
  // collapse controls on a single row when the sidebar is expanded.
  const sidebarLayout = () => jsx('style', {
    className: 'deepchat-sidebar-layout',
    children: [
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) { position: relative; height: 0; padding: 0; margin: 8px 0 0; overflow: visible; }',
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) > :has(.deepchat-sidebar-layout) { display: none; }',
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) [class*="_toggle"] { position: absolute; right: 0; top: 0; height: 38px; }',
      '[class$="_logoRow"]:has(.deepchat-sidebar-layout) ~ button[class*="_newSession"] { margin-right: 40px; }',
    ].join(' '),
  });
  const hero = () => jsxs('span', {
    className: 'deepchat-welcome',
    style: { display: 'inline-flex', alignItems: 'center', gap: '0.6em', fontSize: 'clamp(16px, 2.5vw, 24px)' },
    children: [
      jsx('style', { children: '[class$="_headline"]:has(.deepchat-welcome) > [class$="_titleGroup"] { display: none }' }),
      mark({ size: 40 }), jsx('span', { children: '最近在琢磨什么问题？一起聊聊吧。' }),
    ],
  });
  for (const [name, component] of [
    ['sidebar.brand.mark', () => null], ['sidebar.brand.name', sidebarLayout],
    ['conversation.hero.brand.mark', hero],
  ]) {
    ctx.slots.inject(name, function* () {
      yield ctx.slots.register({ name, priority: -1 }, component);
    });
  }

  // The pinned DSH sidebar exposes navigation through its More menu. The app
  // compacts known secondary entries and leaves other installed plugins alone.
  const secondary = new Set([
    'schedules', 'research-proposals', 'research-ip', 'research-ccf',
    'research-competitions', 'research-servers',
  ]);
  const { MenuItemButton } = loadDshModule('@deepseek-ai/dsh-client-ui-primitives');
  const { resolveSlotLabel } = loadDshModule('@deepseek-ai/dsh-client-ui-slots');
  const moreName = 'sidebar.panellist.actions';
  const panelName = 'sidebar.panellist';
  const secondaryTools = ({ entries, onOpen, onDismiss }) =>
    entries.filter(({ id }) => secondary.has(id)).map(({ id, label, active }) =>
      jsx(MenuItemButton, {
        current: active,
        onSelect: () => {
          onDismiss();
          onOpen(id);
        },
        children: label,
      }, id));
  ctx.slots.inject(moreName, () =>
    ctx.slots.register({ name: moreName, id: 'deepchat-secondary-tools', order: -10 }, secondaryTools));
  ctx.effect(() => {
    const style = document.createElement('style');
    style.className = 'deepchat-sidebar-tools';
    document.head.appendChild(style);
    const refreshTools = () => {
      const panels = ctx.slots.entriesOfSlot(panelName).map(({ options }) => ({
        id: options.id,
        label: resolveSlotLabel(options.label) ?? options.id,
      }));
      const uniqueLabels = new Set(panels.map(({ label }) => label));
      for (const { label } of panels.filter(({ id }) => !secondary.has(id))) uniqueLabels.delete(label);
      const collapsed = 'html:not([data-windows-titlebar]) [class*="_collapsed"]';
      const buttons = [
        collapsed + ' button[class*="_panelRow"][aria-label]',
        collapsed + ' button[class*="_newSession"][aria-label]',
      ];
      // DSH owns its 56px compact rail. Retain its controls and accessible
      // names, then make the same names visible under the compact icons.
      style.textContent = [
        // The bundled research plugin hides DSH's More launcher. Restore
        // that exact launcher when these navigation actions are provided.
        'nav[class*="_panelList"] button[class*="_panelRow"][aria-haspopup="menu"] { display: flex !important; }',
        buttons.join(',') + ' { flex-direction: column; gap: 2px; width: calc(100% - 4px); max-width: 52px; height: auto; min-height: 40px; justify-content: center; margin-inline: 2px; padding: 4px 2px; }',
        buttons.map(selector => selector + '::after').join(',') + ' { content: attr(aria-label); color: inherit; font-size: 10px; line-height: 12px; text-align: center; white-space: normal; overflow-wrap: anywhere; }',
        ...panels.filter(({ id, label }) => secondary.has(id) && uniqueLabels.has(label))
          .map(({ label }) => 'button[class*="_panelRow"][aria-label="' + CSS.escape(label) + '"] { display: none; }'),
      ].join(' ');
    };
    const unsubscribePanels = ctx.slots.subscribe(panelName, refreshTools);
    const unsubscribeLocale = ctx.locale.subscribe(refreshTools);
    refreshTools();
    return () => {
      unsubscribePanels();
      unsubscribeLocale();
      style.remove();
    };
  }, 'DeepChat workbench tools');
  `;
}
