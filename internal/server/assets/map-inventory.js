const mapSubnetFilters = new Map();
const naturalCompare = (a, b) => a.localeCompare(b, undefined, {numeric: true, sensitivity: 'base'});
const compareMapResources = (a, b) => naturalCompare(displayName(a), displayName(b)) || naturalCompare(a.id, b.id);
const SUBNET_PREVIEW_LIMIT = 5;
const SUBNET_CARRIERS = new Set(['aws_db_subnet_group', 'aws_elasticache_subnet_group',
  'aws_memorydb_subnet_group', 'aws_redshift_subnet_group', 'aws_docdb_subnet_group',
  'aws_neptune_subnet_group', 'aws_rds_cluster', 'aws_docdb_cluster', 'aws_neptune_cluster']);

// Follow placement containers, not arbitrary dependencies: a service using a
// database does not inherit the database's subnets.
function resourceSubnets(id, nodes, deps, seen = new Set()) {
  if (seen.has(id)) return [];
  seen.add(id);
  const result = new Set();
  for (const dep of deps.get(id) || []) {
    const node = nodes.get(dep);
    if (node?.type === 'aws_subnet') result.add(dep);
    else if (SUBNET_CARRIERS.has(node?.type)) {
      for (const subnet of resourceSubnets(dep, nodes, deps, seen)) result.add(subnet);
    }
  }
  return [...result];
}

const VPC_RESOURCE_GROUPS = [
  ['Compute & containers', /^aws_(instance$|ecs_|eks_|lambda_|autoscaling_|launch_|batch_)/],
  ['Databases & caches', /^aws_(db_|rds_|elasticache_|memorydb_|redshift_|neptune_|docdb_)/],
  ['Storage', /^aws_(ebs_|volume_|efs_|fsx_)/],
  ['Networking', /^aws_(lb|alb|elb|network_interface|eip|vpc_endpoint|ec2_transit|transit|vpn|customer_gateway|dx_)/],
  ['Security', /^aws_(security_group|vpc_security_group|default_security_group|network_acl|default_network_acl)/],
  ['Other resources', /.*/],
];
function mapResourceSpec(n) {
  return n.meta?.spec || n.meta?.instance_class || n.meta?.node_type ||
    n.meta?.launch_type || n.meta?.engine || '';
}

function compactResourceHTML(n) {
  return `<div class="card ${n.status}" data-id="${esc(n.id)}" data-ws="${esc(RENDER_WS)}" data-compact="true" title="${esc(n.id)}">
    <button type="button" class="card-main" aria-pressed="false" aria-label="${esc(`Pin path: ${displayName(n)}, ${label(n.type)}, ${ACTION_NAMES[n.status]}`)}">
      <span class="ico">${iconSVG(n.type)}</span><span class="n">${esc(displayName(n))}</span>
      <span class="compact-spec">${esc(mapResourceSpec(n) || label(n.type))}</span>
      <span class="status-dot" title="${ACTION_NAMES[n.status]}" aria-hidden="true"></span>
    </button>
    <button type="button" class="card-detail" title="View details" aria-label="${esc(`View details for ${n.id}`)}">&#9432;</button>
  </div>`;
}

function subnetPreviewResources(inside, workspace) {
  const preview = inside.slice(0, SUBNET_PREVIEW_LIMIT);
  const selected = workspace === pinnedWorkspace && inside.find(n => n.id === pinnedId);
  if (selected && !preview.includes(selected)) preview[preview.length - 1] = selected;
  return preview.sort(compareMapResources);
}

function vpcInventoryHTML(p, m, vis) {
  const key = resourceKey(m.workspace, p.vpc.id);
  const all = p.inventory.filter(n => vis.has(n.id));
  if (!all.length) return '';
  let subnet = mapSubnetFilters.get(key) || '';
  if (!p.subnets.some(n => n.id === subnet)) subnet = '';
  const list = all.filter(n => !subnet || (m.subnetsByResource.get(n.id) || []).includes(subnet));
  const groups = new Map(VPC_RESOURCE_GROUPS.map(([name]) => [name, []]));
  for (const n of list) groups.get(VPC_RESOURCE_GROUPS.find(([, pattern]) => pattern.test(n.type))[0]).push(n);
  const rows = [...groups].filter(([, nodes]) => nodes.length).map(([name, nodes]) => `<tbody>
    <tr class="inventory-group"><th colspan="5" scope="rowgroup">${esc(name)} <span>${nodes.length}</span></th></tr>
    ${nodes.sort(compareMapResources).map(n => {
      const changes = RENDER_ATTACHED.get(n.id) || [];
      const subnets = (m.subnetsByResource.get(n.id) || []).map(id => m.nodes.get(id)).filter(Boolean).sort(compareMapResources);
      return `<tr class="card ${n.status}" data-id="${esc(n.id)}" data-ws="${esc(m.workspace)}" data-inventory="true" title="${esc(n.id)}">
        <td><button type="button" class="card-main" aria-pressed="false" aria-label="${esc(`Pin path: ${displayName(n)}, ${label(n.type)}, ${ACTION_NAMES[n.status]}`)}">
          <span class="ico">${iconSVG(n.type)}</span><span class="n">${esc(displayName(n))}</span></button>
          ${changes.length ? `<span class="attached-change-note">${changes.length} attached change${changes.length === 1 ? '' : 's'}</span>` : ''}</td>
        <td>${esc(label(n.type))}</td><td>${esc(mapResourceSpec(n) || '\u2014')}</td>
        <td>${subnets.length ? subnets.map(s => esc(displayName(s))).join(', ') : '<span class="unspecified">Not specified</span>'}</td>
        <td><span class="action ${n.status}">${ACTION_NAMES[n.status]}</span>
          <button type="button" class="card-detail" title="View details" aria-label="${esc(`View details for ${n.id}`)}">&#9432;</button></td>
      </tr>`;
    }).join('')}</tbody>`).join('');
  return `<section class="vpc-inventory" data-inventory-key="${esc(key)}">
    <div class="inventory-heading"><h3>Resources in this VPC <span>${list.length}${subnet ? ' of ' + all.length : ''}</span></h3>
      <select class="inventory-subnet" data-inventory-key="${esc(key)}" aria-label="${esc(`Subnet filter for ${displayName(p.vpc)}`)}">
        <option value="">All subnets</option>${p.subnets.map(n => `<option value="${esc(n.id)}"${n.id === subnet ? ' selected' : ''}>${esc(displayName(n))}</option>`).join('')}
      </select></div>
    <div class="inventory-scroll" tabindex="0" role="region" aria-label="${esc(`Resources in ${displayName(p.vpc)}`)}">
      <table class="vpc-resource-table"><caption class="sr-only">Resources in ${esc(displayName(p.vpc))}</caption>
        <thead><tr><th scope="col">Name</th><th scope="col">Resource type</th><th scope="col">Size / runtime</th><th scope="col">Subnets</th><th scope="col">Change</th></tr></thead>
        ${rows || '<tbody><tr><td colspan="5" class="empty">No resources match this subnet.</td></tr></tbody>'}
      </table></div></section>`;
}

function wireMapInventory() {
  for (const select of $('mapbody').querySelectorAll('.inventory-subnet')) {
    select.addEventListener('change', () => {
      mapSubnetFilters.set(select.dataset.inventoryKey, select.value);
      renderMap(latest);
    });
  }
  for (const button of $('mapbody').querySelectorAll('.subnet-more')) {
    button.addEventListener('click', () => {
      const key = button.dataset.inventoryKey;
      mapSubnetFilters.set(key, button.dataset.subnet);
      renderMap(latest);
      const section = $('mapbody').querySelector(`.vpc-inventory[data-inventory-key="${CSS.escape(key)}"]`);
      section?.scrollIntoView({block: 'nearest'});
      section?.querySelector('.inventory-subnet').focus({preventScroll: true});
    });
  }
}
