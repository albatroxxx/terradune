const ACTION_NAMES = {create: 'Create', update: 'Update', replace: 'Replace', destroy: 'Destroy', existing: 'Unchanged'};
const ACTION_ORDER = {destroy: 0, replace: 1, update: 2, create: 3, existing: 4};
// Shared glyphs are visual fallbacks only; filters always use the exact type.
const TYPE_ICONS = [
  [/^(aws_(vpc|subnet|route|internet|nat_|egress|eip|security_group|network_|instance|ebs_|volume_|ec2_|launch_|autoscaling|vpn_|customer_gateway|default_)|awscc_ec2_)/, 'aws_vpc'],
  [/^aws_(lb|alb|elb)/, 'aws_lb'],
  [/^aws_(ecs_|eks_|ecr_|lambda_|batch_|sfn_|cloudwatch_event|scheduler_)/, 'aws_instance'],
  [/^aws_(s3_|efs_|fsx_|backup_|glacier_)/, 'aws_ebs_volume'],
  [/^aws_(db_|rds_|dynamodb_|elasticache_|memorydb_|redshift_|neptune_|docdb_)/, 'aws_db_instance'],
  [/^aws_(iam_|kms_|secretsmanager_|ssm_|acm_|waf|shield_|guardduty_|cognito_)/, 'aws_security_group'],
  [/^aws_(cloudfront_|route53_|apigateway|api_gateway|globalaccelerator_)/, 'aws_internet_gateway'],
  [/^aws_(sqs_|sns_|mq_|kinesis_|msk_)/, 'aws_route'],
  [/^aws_(cloudwatch_|cloudtrail_|xray_|config_)/, 'aws_route_table'],
];
let reviewService = '', reviewWorkspace = '', changesOnly = false, reviewSort = 'action';
let graphFocus = null;

function resourceKey(workspace, address) { return JSON.stringify([workspace, address]); }

// Resolve a control again after its DOM is replaced. Map resources can appear
// in more than one context, so retain the occurrence as well as its identity.
function focusReference(element) {
  if (!element) return () => null;
  if (element.id) return () => document.getElementById(element.id);
  let selector;
  for (const [kind, attr] of [['.chip', 'data-status'], ['#service-nav button', 'data-service'],
    ['.resource-open', 'data-resource'], ['.relationship-open', 'data-resource'], ['.connection-open', 'data-resource'], ['.graph-node', 'data-key']]) {
    if (element.matches(kind)) {
      selector = `${kind}[${attr}="${CSS.escape(element.getAttribute(attr))}"]`;
      break;
    }
  }
  const card = element.closest('.card');
  if (card && (element.classList.contains('card-main') || element.classList.contains('card-detail'))) {
    const kind = element.classList.contains('card-main') ? 'card-main' : 'card-detail';
    selector = `.card[data-ws="${CSS.escape(card.dataset.ws)}"][data-id="${CSS.escape(card.dataset.id)}"] > .${kind}`;
  }
  if (!selector) return () => element.isConnected ? element : null;
  const index = [...document.querySelectorAll(selector)].indexOf(element);
  return () => document.querySelectorAll(selector)[index] || null;
}

function preserveFocus() {
  const element = document.activeElement, resolve = focusReference(element);
  return () => {
    if (element && !element.isConnected && document.activeElement === document.body && !$('drawer').open) {
      (resolve() || $(expandedView ? 'expand-view' : 'q')).focus({preventScroll: true});
    }
  };
}
function resourceTypeOf(type) {
  return {name: type, icon: TYPE_ICONS.find(([pattern]) => pattern.test(type))?.[1] || type};
}

function inventoryRows(state) {
  const rows = new Map();
  for (const ws of state.workspaces || []) {
    if (reviewWorkspace && ws.name !== reviewWorkspace) continue;
    for (const node of ws.nodes || []) {
      const key = resourceKey(ws.name, node.id);
      rows.set(key, {key, ws, node, service: resourceTypeOf(node.type)});
    }
  }
  return [...rows.values()];
}

function reviewMatches(row) {
  return matches(row.node) && (!reviewService || row.service.name === reviewService) &&
    (!changesOnly || row.node.status !== 'existing');
}

function sortedReviewRows(state) {
  return inventoryRows(state).filter(reviewMatches).sort((a, b) => {
    if (reviewSort === 'action') {
      const action = (ACTION_ORDER[a.node.status] ?? 5) - (ACTION_ORDER[b.node.status] ?? 5);
      if (action) return action;
    }
    return a.node.id.localeCompare(b.node.id) || a.ws.name.localeCompare(b.ws.name);
  });
}

function scopedState(state) {
  return {...state, workspaces: (state.workspaces || []).filter(ws => !reviewWorkspace || ws.name === reviewWorkspace)
    .map(ws => ({...ws, nodes: (ws.nodes || []).filter(node =>
      (!changesOnly || node.status !== 'existing') && (!reviewService || node.type === reviewService))}))};
}

function renderReview(state) {
  const restoreFocus = preserveFocus();
  const all = inventoryRows(state), rows = sortedReviewRows(state);
  const counts = new Map();
  for (const row of all) counts.set(row.service.name, (counts.get(row.service.name) || 0) + 1);
  const services = [...counts].sort((a, b) =>
    (LABELS[a[0]] || a[0]).localeCompare(LABELS[b[0]] || b[0]) || a[0].localeCompare(b[0]));
  $('service-nav').innerHTML = [['', all.length], ...services].map(([name, count]) =>
    `<button type="button" data-service="${esc(name)}" aria-pressed="${reviewService === name}">
      <span>${esc(name ? LABELS[name] || name : 'All resource types')}${name && LABELS[name] ? `<small>${esc(name)}</small>` : ''}</span><b>${count}</b></button>`).join('');
  for (const button of $('service-nav').querySelectorAll('button')) {
    button.addEventListener('click', () => {
      reviewService = button.dataset.service;
      paint(latest);
      [...$('service-nav').querySelectorAll('button')].find(b => b.dataset.service === reviewService)?.focus();
    });
  }
  $('review-count').textContent = `${rows.length} of ${all.length} resources`;
  $('shown').textContent = `${rows.filter(r => r.node.status !== 'existing').length} changes shown`;
  const errors = (state.workspaces || []).filter(ws => (!reviewWorkspace || ws.name === reviewWorkspace) && ws.error);
  $('review-errors').innerHTML = errors.map(ws => `<div class="ws-err">${esc(ws.name)}: ${esc(ws.error)}</div>`).join('');
  $('review-body').innerHTML = rows.map(({key, ws, node: n, service}) => `<tr>
    <td><button type="button" class="resource-open" data-resource="${esc(key)}">
      <span class="resource-icon">${iconSVG(GLYPH[n.type] ? n.type : service.icon)}</span><span class="resource-title">
      <strong>${esc(displayName(n))}</strong><span class="resource-address">${esc(n.id)}</span></span></button></td>
    <td class="service-cell">${esc(LABELS[n.type] || n.type)}</td>
    <td><span class="action ${esc(n.status)}">${esc(ACTION_NAMES[n.status] || n.status)}</span></td>
    <td class="workspace-cell">${esc(ws.name)}<small>${esc(n.meta?.region || n.module || 'root module')}</small></td>
    <td><button type="button" class="relationship-open icon-button" data-resource="${esc(key)}"
      aria-label="${esc('Show relationships for ' + n.id + ' in ' + ws.name)}" title="Show relationships">&#8644;</button></td>
  </tr>`).join('');
  $('review-empty').hidden = rows.length > 0;
  $('review-table').hidden = rows.length === 0;
  $('review-empty-title').textContent = changesOnly && !all.some(r => r.node.status !== 'existing')
    ? 'No changes in this plan' : all.length ? 'No matching resources' : 'Waiting for a plan';
  const byKey = new Map(rows.map(r => [r.key, r]));
  for (const button of $('review-body').querySelectorAll('[data-resource]')) {
    button.addEventListener('click', () => {
      const row = byKey.get(button.dataset.resource);
      if (button.classList.contains('relationship-open')) {
        graphFocus = {workspace: row.ws.name, address: row.node.id};
        firstGraphDraw = true;
        setTab('graph');
        $('graph').focus();
      } else openDetail(row.ws.name, row.node.id, button);
    });
  }
  restoreFocus();
}

function relationshipState(state) {
  const scoped = scopedState(state);
  if (!graphFocus) return scoped;
  return {...state, workspaces: (state.workspaces || []).filter(ws => ws.name === graphFocus.workspace).map(ws => {
    const ids = new Set([graphFocus.address]);
    for (const e of ws.edges || []) {
      if (e.from === graphFocus.address || e.to === graphFocus.address) { ids.add(e.from); ids.add(e.to); }
    }
    return {...ws, nodes: (ws.nodes || []).filter(n => ids.has(n.id))};
  })};
}

function initializeReview() {
  $('workspace-filter').addEventListener('change', e => {
    reviewWorkspace = e.target.value; reviewService = ''; graphFocus = null; firstGraphDraw = true;
    if (latest) paint(latest);
  });
  $('changes-only').addEventListener('change', e => {
    changesOnly = e.target.checked; firstGraphDraw = true;
    if (latest) paint(latest);
  });
  $('review-sort').addEventListener('change', e => {
    reviewSort = e.target.value;
    if (latest) renderReview(latest);
  });
  $('graph-all').addEventListener('click', () => {
    graphFocus = null; firstGraphDraw = true;
    if (latest) paint(latest);
  });
  $('graph-fit').addEventListener('click', fitGraph);
  $('graph-in').addEventListener('click', () => zoomGraph(1.25));
  $('graph-out').addEventListener('click', () => zoomGraph(0.8));
}

function updateWorkspaceFilter(state) {
  const names = (state.workspaces || []).map(ws => ws.name);
  if (reviewWorkspace && !names.includes(reviewWorkspace)) reviewWorkspace = '';
  const options = '<option value="">All workspaces</option>' + names.map(name =>
    `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  if ($('workspace-filter').innerHTML !== options) $('workspace-filter').innerHTML = options;
  $('workspace-filter').value = reviewWorkspace;
}
