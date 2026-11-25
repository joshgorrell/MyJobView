(() => {
  const script = document.currentScript;
  if (!script) return;
  const id = script.dataset.widget;
  const endpoint = script.dataset.config;
  if (!id || !endpoint) return;
  import(new URL('./runtime.js', script.src).href)
    .then(({ mountWidget }) => mountWidget({ kind: 'sales-lead', id, endpoint, script }))
    .catch(() => {});
})();
