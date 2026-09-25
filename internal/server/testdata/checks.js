// Assertions run against the real page script after it has been loaded with
// the stub DOM. STATE is injected by the Go test from real plan fixtures.
var __failures = 0;

function check(name, fn) {
  try {
    fn();
    print('  ok   ' + name);
  } catch (e) {
    __failures++;
    print('  FAIL ' + name + ' -> ' + e);
  }
}

check('Resource Map is the default view', function () {
  if (tab !== 'map') throw new Error('default view is not Resource Map');
});

check('renderMap runs over every workspace', function () {
  renderMap(STATE);
});

check('map produced markup', function () {
  var h = __sinks['mapbody'] || '';
  if (h.length < 500) throw new Error('suspiciously small: ' + h.length);
});

check('every card carries its workspace and address', function () {
  var h = __sinks['mapbody'] || '';
  var cards = (h.match(/class="card /g) || []).length;
  var ws = (h.match(/data-ws="/g) || []).length;
  var ids = (h.match(/data-id="/g) || []).length;
  if (!cards) throw new Error('no cards rendered');
  if (cards !== ws || cards !== ids) {
    throw new Error(cards + ' cards but ' + ws + ' data-ws / ' + ids + ' data-id');
  }
});

check('every card carries an icon', function () {
  var h = __sinks['mapbody'] || '';
  var cards = (h.match(/class="card /g) || []).length;
  var icons = (h.match(/class="ico"/g) || []).length;
  if (icons !== cards) throw new Error(cards + ' cards but ' + icons + ' icons');
});

check('known AWS types get a service glyph rather than the fallback', function () {
  var types = ['aws_vpc', 'aws_subnet', 'aws_route_table', 'aws_instance',
               'aws_nat_gateway', 'aws_internet_gateway', 'aws_security_group',
               'aws_ebs_volume', 'aws_lb', 'aws_eip', 'aws_route'];
  for (var i = 0; i < types.length; i++) {
    var svg = iconSVG(types[i]);
    if (svg.indexOf('<svg') !== 0) throw new Error(types[i] + ' produced no svg');
    if (svg.indexOf('#7D8998') !== -1) throw new Error(types[i] + ' fell back to grey');
  }
});

check('unknown types still render an icon', function () {
  if (iconSVG('random_pet').indexOf('<svg') !== 0) throw new Error('no fallback icon');
});

check('resources living in one subnet are nested inside it', function () {
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('class="contents"') === -1) throw new Error('nothing nested');
});

check('attribute rows handle unknown, changed and nested values', function () {
  var out = attrRows({ a: 'x', nested: { k: [1, 2] }, ch: 'new' }, { ch: 'old' }, ['later']);
  if (out.indexOf('known after apply') === -1) throw new Error('unknown not rendered');
  if (out.indexOf('class="was"') === -1) throw new Error('before/after diff missing');
  if (out.indexOf('<pre>') === -1) throw new Error('nested value not rendered');
});

check('route summary shows destination and pending target', function () {
  var s = summarize('aws_route', { destination_cidr_block: '0.0.0.0/0' }, ['gateway_id']);
  if (s.indexOf('0.0.0.0/0') === -1) throw new Error('destination missing: ' + s);
  if (s.indexOf('known after apply') === -1) throw new Error('unknown target missing: ' + s);
});

check('related rows render an attached route', function () {
  var h = relatedHTML({
    address: 'aws_route.public_internet', type: 'aws_route', status: 'create',
    after: { destination_cidr_block: '0.0.0.0/0' }, unknown: ['gateway_id'],
  });
  if (h.indexOf('0.0.0.0/0') === -1) throw new Error('destination missing');
  if (h.indexOf('<svg') === -1) throw new Error('icon missing');
});

check('graph hierarchy terminates and covers every workspace', function () {
  var root = toElk(STATE);
  if (!root.children || !root.children.length) throw new Error('no workspace groups');
  if (!root.edges.length) throw new Error('no edges');
  var names = {};
  for (var i = 0; i < root.children.length; i++) names[root.children[i].label] = true;
  for (var j = 0; j < STATE.workspaces.length; j++) {
    if (!names[STATE.workspaces[j].name]) {
      throw new Error('missing group for ' + STATE.workspaces[j].name);
    }
  }
});

check('markup escaping neutralises injected html', function () {
  if (esc('<img src=x onerror=1>').indexOf('<') !== -1) throw new Error('not escaped');
});

// --- review mode: search and status filtering ---------------------------
function cardCount() {
  return ((__sinks['mapbody'] || '').match(/class="card /g) || []).length;
}

var __all = cardCount();

check('search narrows the map', function () {
  filter.text = 'nat';
  renderMap(STATE);
  var n = cardCount();
  if (n === 0) throw new Error('search for "nat" matched nothing');
  if (n >= __all) throw new Error('search did not narrow: ' + n + ' of ' + __all);
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('aws_security_group') !== -1) throw new Error('unrelated resource survived');
});

check('search matches attribute values, not just names', function () {
  filter.text = '10.0.100.0';
  renderMap(STATE);
  if (cardCount() === 0) throw new Error('cidr search matched nothing');
});

check('a matching resource keeps the subnet that contains it', function () {
  filter.text = 'app-server-0';
  renderMap(STATE);
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('class="contents"') === -1) throw new Error('nested match lost its subnet');
});

check('status filter shows only that status', function () {
  filter.text = '';
  filter.statuses = new Set(['destroy']);
  renderMap(STATE);
  if (cardCount() !== 0) throw new Error('fixtures have no destroys, got ' + cardCount());
  filter.statuses = new Set(['create']);
  renderMap(STATE);
  if (cardCount() === 0) throw new Error('create filter matched nothing');
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('class="card existing') !== -1) throw new Error('non-create card survived');
});

check('the graph honours the same filter', function () {
  filter.statuses = new Set(['destroy']);
  var root = toElk(STATE);
  if (root.edges.length !== 0) throw new Error('edges survived an empty filter');
});

check('module for_each keys name their resources', function () {
  var n = { id: 'module.rt["web-az1"].aws_route_table.rt[0]', type: 'aws_route_table',
            name: 'rt', module: 'module.rt["web-az1"]', status: 'create' };
  if (displayName(n) !== 'web-az1') {
    throw new Error('got ' + displayName(n) + ', want the module key');
  }
  if (cardHTML(n).indexOf('rt[0]') === -1) {
    throw new Error('resource name dropped from the card');
  }
  // A Name tag still wins, and an unkeyed resource keeps its own name.
  var tagged = { id: 'aws_vpc.main', type: 'aws_vpc', name: 'main', module: '',
                 status: 'create', meta: { name: 'prod-vpc' } };
  if (displayName(tagged) !== 'prod-vpc') throw new Error('Name tag ignored');
  var plain = { id: 'aws_eip.n[1]', type: 'aws_eip', name: 'n', module: '', status: 'create' };
  if (displayName(plain) !== 'n[1]') throw new Error('got ' + displayName(plain));
});

// --- directional path tracing on hover ----------------------------------
check('links point along the columns, vpc -> subnet -> route table -> gateway', function () {
  filter.text = ''; filter.statuses = new Set();
  var vpcWs = null;
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'vpc') vpcWs = STATE.workspaces[i];
  }
  if (!vpcWs) throw new Error('no vpc workspace in fixtures');
  var m = buildMap(vpcWs);
  var byId = {};
  for (var j = 0; j < vpcWs.nodes.length; j++) byId[vpcWs.nodes[j].id] = vpcWs.nodes[j];
  // Only the hops of the route path are constrained to the column order. A
  // plain relationship -- the subnet a NAT gateway sits in -- is free to
  // connect whatever it genuinely connects.
  var kinds = {};
  for (var k = 0; k < m.links.length; k++) {
    var l = m.links[k];
    if (!l.flow) continue;
    kinds[byId[l.from].type + '->' + byId[l.to].type] = true;
  }
  var want = ['aws_vpc->aws_subnet', 'aws_subnet->aws_route_table',
              'aws_route_table->aws_internet_gateway', 'aws_route_table->aws_nat_gateway'];
  for (var w = 0; w < want.length; w++) {
    if (!kinds[want[w]]) throw new Error('missing link direction ' + want[w]);
  }
  // The reverse of containment must not appear: the VPC leads to its subnets.
  if (kinds['aws_subnet->aws_vpc']) throw new Error('containment points the wrong way');
  // Each hop is one column wide, so nothing may skip the route tables.
  var skips = ['aws_vpc->aws_route_table', 'aws_vpc->aws_nat_gateway',
               'aws_vpc->aws_internet_gateway', 'aws_subnet->aws_nat_gateway',
               'aws_subnet->aws_internet_gateway'];
  for (var s = 0; s < skips.length; s++) {
    if (kinds[skips[s]]) throw new Error('a link skips a column: ' + skips[s]);
  }
});

check('hovering a subnet traces its own path and not a sibling', function () {
  var vpcWs = null;
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'vpc') vpcWs = STATE.workspaces[i];
  }
  var m = buildMap(vpcWs);
  var traced = tracePath('aws_subnet.public[0]', adjacencyOf(m.links));
  if (!traced.nodes.has('aws_vpc.main')) throw new Error('lost the containing VPC');
  if (!traced.nodes.has('aws_route_table.public')) throw new Error('lost the route table');
  if (!traced.nodes.has('aws_internet_gateway.main')) throw new Error('lost the gateway');
  // public[1] shares that route table; reaching it would need a backwards hop.
  if (traced.nodes.has('aws_subnet.public[1]')) throw new Error('lit up a sibling subnet');
  if (traced.nodes.has('aws_subnet.private[0]')) throw new Error('lit up an unrelated subnet');
  // Edges are recorded in their drawn direction so the arrowheads match.
  if (!traced.edges.has('aws_subnet.public[0] aws_route_table.public')) {
    throw new Error('subnet -> route table edge not traced');
  }
  if (!traced.edges.has('aws_vpc.main aws_subnet.public[0]')) {
    throw new Error('vpc -> subnet edge not traced in its drawn direction');
  }
});

check('hovering a route table reaches its subnets and its gateway', function () {
  var vpcWs = null;
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'vpc') vpcWs = STATE.workspaces[i];
  }
  var m = buildMap(vpcWs);
  var traced = tracePath('aws_route_table.public', adjacencyOf(m.links));
  if (!traced.nodes.has('aws_subnet.public[0]')) throw new Error('lost an associated subnet');
  if (!traced.nodes.has('aws_subnet.public[1]')) throw new Error('lost an associated subnet');
  if (!traced.nodes.has('aws_internet_gateway.main')) throw new Error('lost the gateway');
});

check('ribbons stay hidden until something is hovered', function () {
  renderMap(STATE);
  var drawn = document.getElementById('ribbons').querySelectorAll('path');
  if (!drawn.length) throw new Error('no ribbons drawn');
  var directed = 0;
  for (var i = 0; i < drawn.length; i++) {
    if (drawn[i].getAttribute('opacity') !== '0') {
      throw new Error('a ribbon is visible before anything is hovered');
    }
    if (!drawn[i].getAttribute('marker-end') && !drawn[i].getAttribute('stroke-dasharray')) {
      throw new Error('connection has no endpoint marker');
    }
    if (drawn[i].dataset.from && drawn[i].dataset.to) directed++;
  }
  if (directed !== drawn.length) throw new Error('ribbons missing a direction');
  print('       (' + drawn.length + ' directed ribbons)');
});

check('hovering reveals the traced path only', function () {
  renderMap(STATE);
  hoverApi.hover('aws_subnet.public[0]');
  var drawn = document.getElementById('ribbons').querySelectorAll('path');
  var hot = [], cold = 0;
  for (var i = 0; i < drawn.length; i++) {
    if (drawn[i].getAttribute('opacity') !== '0') {
      hot.push(drawn[i].dataset.from + ' -> ' + drawn[i].dataset.to);
    } else cold++;
  }
  if (!hot.length) throw new Error('hover revealed nothing');
  if (!cold) throw new Error('hover revealed every ribbon rather than a path');
  var joined = hot.join(' | ');
  if (joined.indexOf('aws_vpc.main -> aws_subnet.public[0]') === -1) {
    throw new Error('no arrow from the VPC: ' + joined);
  }
  if (joined.indexOf('aws_subnet.public[0] -> aws_route_table.public') === -1) {
    throw new Error('no arrow to the route table: ' + joined);
  }
  if (joined.indexOf('aws_route_table.public -> aws_internet_gateway.main') === -1) {
    throw new Error('no arrow on to the gateway: ' + joined);
  }
  hoverApi.clear();
  for (var j = 0; j < drawn.length; j++) {
    if (drawn[j].getAttribute('opacity') !== '0') {
      throw new Error('ribbons stayed visible after the hover ended');
    }
  }
});

check('connection masks cut out card interiors without creating false endpoints', function () {
  renderMap(STATE);
  var svg = $('ribbons'), mask = svg.children.find(el => el.tag === 'mask');
  if (!mask || mask.getAttribute('maskUnits') !== 'userSpaceOnUse') throw new Error('missing coordinate-space mask');
  if (mask.children.length !== __allCards().length + 1) throw new Error('not every card is protected');
  if (mask.children[0].getAttribute('fill') !== 'white') throw new Error('connections hidden outside cards');
  for (var rect of mask.children.slice(1)) {
    if (rect.getAttribute('fill') !== 'black' || Number(rect.getAttribute('width')) <= 0) throw new Error('invalid card cutout');
  }
  for (var path of svg.querySelectorAll('path')) {
    if (path.getAttribute('mask') !== 'url(#map-card-mask)') throw new Error('unprotected connection');
    if (!path.dataset.from || !path.dataset.to) throw new Error('lost true endpoints');
  }
});

check('a ribbon runs from the vpc to its subnet, not the reverse', function () {
  var drawn = document.getElementById('ribbons').querySelectorAll('path');
  var found = false, reversed = false;
  for (var i = 0; i < drawn.length; i++) {
    var f = drawn[i].dataset.from, t = drawn[i].dataset.to;
    if (f === 'aws_vpc.main' && t === 'aws_subnet.public[0]') found = true;
    if (t === 'aws_vpc.main' && f === 'aws_subnet.public[0]') reversed = true;
  }
  if (!found) throw new Error('no vpc -> subnet ribbon');
  if (reversed) throw new Error('ribbon drawn subnet -> vpc');
});

check('a VPC joins its subnets and nothing further', function () {
  filter.text = ''; filter.statuses = new Set();
  for (var i = 0; i < STATE.workspaces.length; i++) {
    var ws = STATE.workspaces[i];
    var m = buildMap(ws);
    var out = {};
    for (var k = 0; k < m.links.length; k++) {
      (out[m.links[k].from] = out[m.links[k].from] || {})[m.links[k].to] = true;
    }
    for (var p = 0; p < m.panels.length; p++) {
      var panel = m.panels[p];
      for (var n = 0; n < panel.subnets.length; n++) {
        if (!(out[panel.vpc.id] || {})[panel.subnets[n].id]) {
          throw new Error(ws.name + ': subnet ' + panel.subnets[n].id + ' unjoined');
        }
      }
      // Route tables and gateways are reached through the subnets, so a VPC
      // must not short-circuit straight to them.
      var beyond = panel.routeTables.concat(panel.gateways);
      for (var b = 0; b < beyond.length; b++) {
        if ((out[panel.vpc.id] || {})[beyond[b].id]) {
          throw new Error(ws.name + ': vpc points straight at ' + beyond[b].id);
        }
      }
    }
  }
});

check('resources beside the columns are grouped by type', function () {
  filter.text = ''; filter.statuses = new Set();
  renderMap(STATE);
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('class="cat"') === -1) throw new Error('no category groups rendered');
  var headings = {}, re = /<span>([^<]*)<\/span>\s*<em>(\d+)<\/em><\/h4>/g, m;
  while ((m = re.exec(h)) !== null) headings[m[1]] = Number(m[2]);
  // Outside-VPC resources retain exact-type groups; VPC members now use a
  // full-width inventory grouped by purpose, while keeping their exact types.
  ['EBS volume'].forEach(function (want) {
    if (!headings[want]) throw new Error('no category for ' + want +
      '; got ' + Object.keys(headings).join(', '));
  });
  if (headings['Load balancer']) {
    throw new Error('load balancer listed beside the columns, not drawn as its own map');
  }
  if (headings['EBS volume'] !== 2) throw new Error('wrong count for EBS volume');
  if (!h.includes('Resources in this VPC') || !h.includes('Security <span>') || !h.includes('class="inventory-grid"') || h.includes('<td>Security group</td>')) {
    throw new Error('VPC security inventory missing');
  }
  if (!/<h4>\s*<svg/.test(h)) throw new Error('category heading has no icon');
});

check('hovering an instance reaches its subnet, interfaces and volumes', function () {
  var ec2 = null;
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'ec2') ec2 = STATE.workspaces[i];
  }
  if (!ec2) throw new Error('no ec2 workspace in fixtures');
  var m = buildMap(ec2), byId = {};
  for (var j = 0; j < ec2.nodes.length; j++) byId[ec2.nodes[j].id] = ec2.nodes[j];
  var traced = tracePath('aws_instance.app[0]', adjacencyOf(m.links));
  var kinds = {};
  traced.nodes.forEach(function (id) { if (byId[id]) kinds[byId[id].type] = true; });
  ['aws_subnet', 'aws_ebs_volume', 'aws_security_group'].forEach(function (t) {
    if (!kinds[t]) {
      throw new Error('instance did not reach ' + t + '; reached ' + Object.keys(kinds).join(', '));
    }
  });
  // The volume is bound by an attachment, which must be collapsed rather
  // than left as a dead end.
  if (!traced.nodes.has('aws_ebs_volume.data[0]')) {
    throw new Error('did not reach the volume attached to this instance');
  }
  if (traced.nodes.has('aws_ebs_volume.data[1]')) {
    throw new Error('reached another instance volume');
  }
});

check('a relationship is one hop, so hovering does not sprawl', function () {
  var ec2 = null;
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'ec2') ec2 = STATE.workspaces[i];
  }
  var m = buildMap(ec2);
  var traced = tracePath('aws_instance.app[0]', adjacencyOf(m.links));
  // The load balancer reaches every subnet; an instance sharing a target
  // group with it must not inherit that whole spread.
  if (traced.nodes.has('aws_subnet.web[1]')) {
    throw new Error('hovering an instance dragged in an unrelated subnet');
  }
  if (traced.nodes.size > 12) {
    throw new Error('an instance lit up ' + traced.nodes.size + ' resources');
  }
  // A subnet still reads end to end along the VPC path.
  var viaSubnet = tracePath('aws_subnet.web[0]', adjacencyOf(m.links));
  if (!viaSubnet.nodes.has('aws_internet_gateway.app')) {
    throw new Error('the VPC path stopped short of the gateway');
  }
});

check('pinning holds the path, and survives a redraw', function () {
  filter.text = ''; filter.statuses = new Set();
  renderMap(STATE);
  var drawn = document.getElementById('ribbons').querySelectorAll('path');
  function visible() {
    var n = 0;
    for (var i = 0; i < drawn.length; i++) {
      if (drawn[i].getAttribute('opacity') !== '0') n++;
    }
    return n;
  }
  hoverApi.pin('aws_subnet.public[0]');
  var lit = visible();
  if (!lit) throw new Error('pinning revealed nothing');
  if (hoverApi.pinned() !== 'aws_subnet.public[0]') throw new Error('pin not recorded');

  // Moving the pointer away must not drop a pinned path.
  hoverApi.clear();
  if (visible() !== lit) throw new Error('the pinned path was cleared by a mouse-out');

  // A re-plan redraws everything; the pin should come back with it.
  renderMap(STATE);
  drawn = document.getElementById('ribbons').querySelectorAll('path');
  if (hoverApi.pinned() !== 'aws_subnet.public[0]') throw new Error('pin lost on redraw');
  if (!visible()) throw new Error('the pinned path did not survive the redraw');

  hoverApi.pin(null);
  if (hoverApi.pinned()) throw new Error('pin not released');
  if (visible()) throw new Error('releasing the pin left ribbons behind');
});

check('a pin on a card that disappears is dropped', function () {
  renderMap(STATE);
  hoverApi.pin('aws_subnet.public[0]');
  filter.statuses = new Set(['destroy']); // fixtures have none, so all cards go
  renderMap(STATE);
  if (hoverApi.pinned()) throw new Error('pinned a card that is no longer drawn');
  filter.statuses = new Set();
  renderMap(STATE);
});

check('a mixed column is grouped, a single-type one is not', function () {
  filter.text = ''; filter.statuses = new Set();
  renderMap(STATE);
  var h = __sinks['mapbody'] || '';
  var headings = {}, re = /<span>([^<]*)<\/span>\s*<em>(\d+)<\/em><\/h4>/g, m;
  while ((m = re.exec(h)) !== null) headings[m[1]] = Number(m[2]);
  // The vpc fixture's network connections hold gateways of two kinds.
  ['NAT gateway', 'Internet gateway'].forEach(function (want) {
    if (!headings[want]) {
      throw new Error('no category heading for ' + want +
        '; got ' + Object.keys(headings).join(', '));
    }
  });
  // Route tables are all one type, so they are listed without a heading.
  if (headings['Route table']) {
    throw new Error('a single-type column was given a redundant heading');
  }
});

check('categories flow across the width', function () {
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('class="cats"') === -1) {
    throw new Error('categories are not laid out to share the row');
  }
});

check('a resource is only in a VPC when it reaches one', function () {
  filter.text = ''; filter.statuses = new Set();
  var simple = null;
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'ec2') simple = STATE.workspaces[i];
  }
  var m = buildMap(simple);
  // Everything placed in a panel must actually reach the VPC.
  var deps = {};
  for (var e = 0; e < simple.edges.length; e++) {
    (deps[simple.edges[e].from] = deps[simple.edges[e].from] || []).push(simple.edges[e].to);
  }
  var byId = {};
  for (var j = 0; j < simple.nodes.length; j++) byId[simple.nodes[j].id] = simple.nodes[j];
  m.panels.forEach(function (p) {
    p.inVpc.concat(p.subnets, p.routeTables, p.gateways).forEach(function (n) {
      if (n.meta && n.meta.scope === 'vpc') return; // in one by definition
      var reaches = (deps[n.id] || []).some(function (d) {
        return byId[d] && (byId[d].type === 'aws_vpc' ||
          (deps[d] || []).some(function (dd) { return byId[dd] && byId[dd].type === 'aws_vpc'; }));
      });
      if (!reaches) throw new Error(n.id + ' was placed in a VPC it does not reach');
    });
  });
});

check('resources outside a VPC are filed by their real scope', function () {
  renderMap(STATE);
  var h = __sinks['mapbody'] || '';
  // The simple workspace is random_pet and local_file: neither is AWS.
  if (h.indexOf('Outside AWS') === -1) {
    throw new Error('non-AWS resources were not filed outside AWS');
  }
  // Scope comes from the plan, not from a guess about the type.
  var kinds = {};
  STATE.workspaces.forEach(function (ws) {
    ws.nodes.forEach(function (n) { kinds[n.type] = n.meta && n.meta.scope; });
  });
  if (kinds['random_pet'] !== 'external') throw new Error('random_pet is not external');
  // A subnet cannot exist outside a VPC; an SSM parameter or an EIP can.
  if (kinds['aws_subnet'] !== 'vpc') throw new Error('aws_subnet is not vpc-scoped');
  if (kinds['aws_route_table'] !== 'vpc') throw new Error('aws_route_table is not vpc-scoped');
  // An Elastic IP is not inside a VPC, but it serves one, so it is drawn
  // beside the VPC its NAT gateway attaches it to.
  if (kinds['aws_eip'] !== 'network') throw new Error('aws_eip is not network-scoped');
  if (kinds['aws_ssm_parameter'] && kinds['aws_ssm_parameter'] !== 'region') {
    throw new Error('aws_ssm_parameter should be region-scoped');
  }
});

check('networking that serves a VPC is drawn with it', function () {
  filter.text = ''; filter.statuses = new Set();
  var vpcWs = null;
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'vpc') vpcWs = STATE.workspaces[i];
  }
  var m = buildMap(vpcWs);
  var inPanel = {};
  m.panels.forEach(function (p) {
    p.inVpc.concat(p.subnets, p.routeTables, p.gateways).forEach(function (n) {
      inPanel[n.id] = true;
    });
  });
  // The EIPs are held by NAT gateways in this VPC, so they belong with it.
  ['aws_eip.nat[0]', 'aws_eip.nat[1]'].forEach(function (id) {
    if (!inPanel[id]) throw new Error(id + ' was left out of the VPC it serves');
  });
  // And it did not drag in things that merely happen to be nearby.
  m.scopes.region.concat(m.scopes.account, m.scopes.external).forEach(function (n) {
    if (n.type === 'aws_eip') throw new Error('an attached EIP stayed outside');
  });
});

check('links are not duplicated', function () {
  for (var i = 0; i < STATE.workspaces.length; i++) {
    var m = buildMap(STATE.workspaces[i]), seen = {};
    for (var k = 0; k < m.links.length; k++) {
      var key = m.links[k].from + ' ' + m.links[k].to;
      if (seen[key]) throw new Error('duplicate link ' + key);
      seen[key] = true;
    }
  }
});

check('clearing filters restores every card', function () {
  filter.text = '';
  filter.statuses = new Set();
  renderMap(STATE);
  if (cardCount() !== __all) throw new Error('got ' + cardCount() + ', want ' + __all);
});

// --- infrastructure that already exists ---------------------------------
// The platform fixture is applied: every id in it is a real value. That is
// what real codebases look like, and several of these relationships cannot be
// seen any other way.
function platformMap() {
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'platform') return buildMap(STATE.workspaces[i]);
  }
  throw new Error('no platform workspace in fixtures');
}

check('a NAT gateway shows the subnet it sits in', function () {
  var m = platformMap();
  var path = tracePath('aws_nat_gateway.main[0]', adjacencyOf(m.links));
  // The subnet holding it, which is the one the console draws it in...
  if (!path.nodes.has('aws_subnet.public[0]')) {
    throw new Error('the subnet holding the gateway is not on its path: ' +
      Array.from(path.nodes).join(', '));
  }
  // ...and the private subnet that reaches the internet through it, which is
  // a different subnet and a different question.
  if (!path.nodes.has('aws_subnet.private[0]')) {
    throw new Error('the subnet routing through the gateway is not on its path');
  }
});

check('a route table shows the subnets associated with it', function () {
  var m = platformMap();
  var path = tracePath('aws_route_table.public', adjacencyOf(m.links));
  ['aws_subnet.public[0]', 'aws_subnet.public[1]'].forEach(function (id) {
    if (!path.nodes.has(id)) throw new Error(id + ' missing from the route table path');
  });
});

check('a load balancer is drawn as its own map, not a list', function () {
  filter.text = ''; filter.statuses = new Set();
  renderMap(STATE);
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('class="vpc-panel lb-panel"') === -1) {
    throw new Error('no load balancer map rendered');
  }
  ['Load balancer', 'Listeners', 'Rules', 'Target groups', 'Targets'].forEach(function (col) {
    if (h.indexOf('>' + col + ' ') === -1 && h.indexOf('>' + col + '<') === -1) {
      throw new Error('load balancer map has no ' + col + ' column');
    }
  });
  // Two listeners on one balancer differ only by port, and two rules only by
  // what they match, so the cards have to actually print those.
  if (h.indexOf('HTTP:80') === -1) throw new Error('listener card does not show its port');
  if (h.indexOf('/api/*') === -1) throw new Error('rule card does not show what it matches');
  if (h.indexOf('internet-facing') === -1) throw new Error('load balancer does not show its scheme');
});

check('the load balancer map runs listener -> rule -> target group -> target', function () {
  var m = platformMap();
  var stacks = [];
  for (var i = 0; i < m.panels.length; i++) {
    stacks = stacks.concat(m.panels[i].lbs || []);
  }
  if (stacks.length !== 1) throw new Error('want one load balancer, got ' + stacks.length);
  var s = stacks[0];
  if (s.listeners.length !== 1) throw new Error('want one listener');
  if (s.rules.length !== 1) throw new Error('want one rule');
  if (s.groups.length !== 2) throw new Error('want two target groups, got ' + s.groups.length);
  if (s.targets.length !== 3) throw new Error('want three targets, got ' + s.targets.length);

  // Following the balancer forwards has to arrive at the instances serving it.
  var path = tracePath(s.lb.id, adjacencyOf(m.links));
  ['aws_lb_listener.http', 'aws_lb_listener_rule.api', 'aws_lb_target_group.web',
   'aws_lb_target_group.api', 'aws_instance.web[0]', 'aws_instance.api'].forEach(function (id) {
    if (!path.nodes.has(id)) throw new Error(id + ' is not on the load balancer path');
  });
});

check('listeners and rules are told apart by port and match', function () {
  var m = platformMap();
  var s = m.panels[0].lbs[0];
  if (s.listeners[0].meta.port !== '80') throw new Error('listener lost its port');
  if (s.listeners[0].meta.protocol !== 'HTTP') throw new Error('listener lost its protocol');
  if (s.rules[0].meta.match !== '/api/*') {
    throw new Error('rule lost what it matches: ' + s.rules[0].meta.match);
  }
});

check('what the load balancer map draws is not also listed beside the columns', function () {
  var m = platformMap();
  var beside = {};
  for (var i = 0; i < m.panels.length; i++) {
    for (var j = 0; j < m.panels[i].inVpc.length; j++) beside[m.panels[i].inVpc[j].type] = true;
  }
  ['aws_lb', 'aws_lb_listener', 'aws_lb_listener_rule', 'aws_lb_target_group']
    .forEach(function (t) {
      if (beside[t]) throw new Error(t + ' is listed beside the columns as well');
    });
  // The security groups are not part of that map, so they stay.
  if (!beside['aws_security_group']) throw new Error('security groups went missing');
});

check('a module\'s instances are nested in another module\'s subnets', function () {
  // The layered fixture passes subnet ids from the network module to the app
  // module through a local, so this placement exists only because the
  // instances carry the ids of the subnets they are in.
  var ws = null;
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'layered') ws = STATE.workspaces[i];
  }
  if (!ws) throw new Error('no layered workspace in fixtures');
  var m = buildMap(ws);
  if (m.panels.length !== 1) throw new Error('want one VPC panel, got ' + m.panels.length);
  var nestedIn = {};
  m.panels[0].contents.forEach(function (list, subnetId) {
    for (var j = 0; j < list.length; j++) nestedIn[list[j].id] = subnetId;
  });
  [['module.app.aws_instance.this[0]', 'module.network.aws_subnet.private[0]'],
   ['module.app.aws_instance.this[1]', 'module.network.aws_subnet.private[1]']]
    .forEach(function (pair) {
      if (nestedIn[pair[0]] !== pair[1]) {
        throw new Error(pair[0] + ' sits in ' + nestedIn[pair[0]] + ', want ' + pair[1]);
      }
    });
  // Nothing from the app module was stranded outside the VPC.
  for (var k = 0; k < m.others.length; k++) {
    if (m.others[k].type === 'aws_instance') {
      throw new Error('an instance was left outside the VPC: ' + m.others[k].id);
    }
  }
});

// --- locking and details ------------------------------------------------
check('single click keeps the map, double click focuses with sections intact', function () {
  filter.text = ''; filter.statuses = new Set();
  renderMap(STATE);
  if (hoverApi.pinned()) hoverApi.pin(null);

  var cards = __allCards(), card = null;
  for (var i = 0; i < cards.length && !card; i++) {
    if (cards[i].dataset.id === 'aws_subnet.public[0]') card = cards[i];
  }
  if (!card) throw new Error('no subnet card to click');

  var fullMap = __sinks.mapbody;
  __fire(card, 'click', 1);
  if (__sinks.mapbody !== fullMap) throw new Error('single click rearranged the map');
  if (hoverApi.pinned() !== 'aws_subnet.public[0]') {
    throw new Error('a single click did not lock the path');
  }
  if (!card.classList.contains('pinned')) throw new Error('the card is not marked as locked');

  // The second click of a double arrives as a click too. It must be ignored,
  // or the lock the first click took would be released again.
  var opened = null, real = openDetail;
  openDetail = function (ws, id) { opened = id; };
  __fire(card, 'click', 2);
  __fire(card, 'dblclick');
  openDetail = real;

  if (opened || !focusedDependencies) throw new Error('double click did not focus dependencies');
  if (!__sinks.mapbody.includes('class="vpc-panel"') || !__sinks.mapbody.includes('class="az"')) throw new Error('focus lost section hierarchy');
  if (__sinks.mapbody.includes('data-id="aws_subnet.private[0]"')) throw new Error('focus kept unrelated subnet');
  if (hoverApi.pinned() !== 'aws_subnet.public[0]') {
    throw new Error('the double click released the lock');
  }

  // Clicking it once more lets go.
  __fire(card, 'click', 1);
  if (hoverApi.pinned()) throw new Error('clicking the locked card again did not release it');
});

check('the legend stays folded away until asked for', function () {
  var legend = $('legend'), btn = $('legend-btn');
  legend.classList.add('closed'); // the state the markup ships in
  __fire(btn, 'click');
  if (legend.classList.contains('closed')) throw new Error('the button did not open the legend');
  if (btn.getAttribute('aria-expanded') !== 'true') throw new Error('aria-expanded not set');
  __fire(btn, 'click');
  if (!legend.classList.contains('closed')) throw new Error('the button did not fold it away');
  if (btn.getAttribute('aria-expanded') !== 'false') throw new Error('aria-expanded not cleared');
});

check('keyboard activation pins a path and the details action does not unpin it', function () {
  renderMap(STATE);
  var card = __allCards()[0];
  __fire(card, 'click', 0); // native button keyboard activation has detail zero
  if (hoverApi.pinned() !== card.dataset.id) throw new Error('keyboard pin failed');
  if (card._main.getAttribute('aria-pressed') !== 'true') throw new Error('pin state not exposed');
  var opened, real = openDetail;
  try {
    openDetail = function (ws, id, opener) { opened = [ws, id, opener]; };
    __fire(card._detail, 'click', 0);
  } finally { openDetail = real; }
  if (!opened || opened[0] !== card.dataset.ws || opened[1] !== card.dataset.id || opened[2] !== card._detail) {
    throw new Error('details action lost resource identity or opener');
  }
  if (hoverApi.pinned() !== card.dataset.id) throw new Error('details action released the pin');
  __fire(card, 'click', 0);
  if (card._main.getAttribute('aria-pressed') !== 'false') throw new Error('released pin state not exposed');
});

check('arrow keys switch tabs and move focus with the selected state', function () {
  __fire($('tab-review'), 'keydown', 0, 'ArrowRight');
  if (tab !== 'graph' || document.activeElement !== $('tab-graph')) throw new Error('graph not focused');
  if ($('tab-graph').getAttribute('aria-selected') !== 'true' || $('tab-review').tabIndex !== -1) {
    throw new Error('selected state or roving tabindex wrong');
  }
  __fire($('tab-graph'), 'keydown', 0, 'Home');
  if (tab !== 'map' || document.activeElement !== $('tab-map')) throw new Error('map not restored');
  __fire($('tab-map'), 'keydown', 0, 'ArrowRight');
  if (tab !== 'review') throw new Error('Plan is not second');
  __fire($('tab-review'), 'keydown', 0, 'End');
  if (tab !== 'graph') throw new Error('Graph is not last');
  setTab('map');
});

check('expanded view restores with Escape and exposes its state', function () {
  setLegend(false);
  __fire($('expand-view'), 'click');
  if (!document.body.classList.contains('expanded-view')) throw new Error('view not expanded');
  if ($('expand-view').getAttribute('aria-label') !== 'Restore view' || $('expand-view').getAttribute('aria-pressed') !== 'true') {
    throw new Error('expanded state not exposed');
  }
  setLegend(true);
  __fire(window, 'keydown', 0, 'Escape');
  if (!$('legend').classList.contains('closed') || !expandedView) throw new Error('Escape did not close only the legend');
  __fire(window, 'keydown', 0, 'Escape');
  if (expandedView || document.body.classList.contains('expanded-view')) throw new Error('view not restored');
});

check('map paths and pins are isolated by workspace, including redraws', function () {
  var base = STATE.workspaces.find(function (ws) { return ws.name === 'platform'; });
  var state = {workspaces: ['dev', 'prod'].map(function (name) { return Object.assign({}, base, {name: name}); })};
  renderMap(state);
  hoverApi.pin('aws_subnet.public[0]', 'prod');
  var pinned = __allCards().filter(function (c) { return c.classList.contains('pinned'); });
  if (!pinned.length || pinned.some(function (c) { return c.dataset.ws !== 'prod'; })) throw new Error('pin crossed workspaces');
  var paths = $('ribbons').children.filter(function (p) { return p.getAttribute('opacity') === '1'; });
  if (!paths.length || paths.some(function (p) { return p.dataset.ws !== 'prod'; })) throw new Error('path crossed workspaces');
  var prodVPC = __allCards().find(function (c) { return c.dataset.ws === 'prod' && c.dataset.id === 'aws_vpc.main'; });
  var source = paths.find(function (p) { return p.dataset.from === 'aws_vpc.main'; });
  var rect = prodVPC.getBoundingClientRect();
  var x = Number(source.getAttribute('d').split(' ')[1]);
  if (x < rect.left || x > rect.left + rect.width) throw new Error('ribbon anchored to other workspace');
  renderMap(state);
  if (pinnedWorkspace !== 'prod') throw new Error('redraw changed workspace');
  renderMap({workspaces: [state.workspaces[0]]});
  if (hoverApi.pinned()) throw new Error('removed workspace pin migrated to another workspace');
  renderMap(STATE);
});

check('stacked cards have gutter connections and isolated hover clears old paths', function () {
  renderMap(STATE);
  var vpc = __allCards().find(function (c) { return c.dataset.ws === 'platform' && c.dataset.id === 'aws_vpc.main'; });
  var subnet = __allCards().find(function (c) { return c.dataset.ws === 'platform' && c.dataset.id === 'aws_subnet.public[0]'; });
  vpc._main.getBoundingClientRect = function () { return {left: 40, top: 20, width: 200, height: 60}; };
  subnet._main.getBoundingClientRect = function () { return {left: 40, top: 180, width: 200, height: 60}; };
  drawRibbons(STATE.workspaces.map(buildMap));
  wireHover(STATE.workspaces.map(buildMap));
  var path = $('ribbons').children.find(function (p) { return p.dataset.ws === 'platform' && p.dataset.from === 'aws_vpc.main' && p.dataset.to === 'aws_subnet.public[0]'; });
  if (!path || !path.getAttribute('d').includes(' L ')) throw new Error('stacked connection missing');
  hoverApi.hover('aws_subnet.public[0]', 'platform');
  hoverApi.hover('isolated', 'platform');
  if ($('ribbons').querySelectorAll('path').some(function (p) { return p.getAttribute('opacity') !== '0'; })) throw new Error('previous path left behind');
  hoverApi.clear();
  renderMap(STATE);
});

check('long associations route around intervening card headers', function () {
  var a = {x: 20, y: 100, w: 100, h: 60}, b = {x: 400, y: 100, w: 100, h: 60};
  var blocker = {x: 200, y: 70, w: 100, h: 130};
  var d = ribbonRoute(a, b, [a, blocker, b]);
  var numbers = d.match(/[\d.]+/g).map(Number);
  for (var i = 2; i < numbers.length; i += 2) {
    var x1 = numbers[i - 2], y1 = numbers[i - 1], x2 = numbers[i], y2 = numbers[i + 1];
    var hits = x1 === x2 ? x1 > 200 && x1 < 300 && Math.max(y1, y2) > 70 && Math.min(y1, y2) < 200
      : y1 > 70 && y1 < 200 && Math.max(x1, x2) > 200 && Math.min(x1, x2) < 300;
    if (hits) throw new Error('association crosses an unrelated card: ' + d);
  }
});

check('inventory includes unknown types, glue and identical addresses in different workspaces', function () {
  var state = {workspaces: [
    {name: 'dev', nodes: [{id: 'aws_future_service.main', type: 'aws_future_service', status: 'create'},
      {id: 'aws_route.main', type: 'aws_route', status: 'destroy'}]},
    {name: 'prod', nodes: [{id: 'aws_future_service.main', type: 'aws_future_service', status: 'existing'}]},
  ]};
  var rows = sortedReviewRows(state);
  if (rows.length !== 3 || rows[0].node.status !== 'destroy') throw new Error('coverage or priority wrong');
  if (new Set(rows.map(function (r) { return r.key; })).size !== 3) throw new Error('workspace identity collided');
  reviewWorkspace = 'dev'; changesOnly = true;
  if (sortedReviewRows(state).length !== 2) throw new Error('scope or changes filter wrong');
  reviewService = 'aws_future_service';
  if (sortedReviewRows(state).length !== 1) throw new Error('service filter wrong');
  reviewWorkspace = ''; reviewService = ''; changesOnly = false;
});

check('plan filters keep every exact resource type separate', function () {
  var types = ['aws_instance', 'aws_vpc', 'aws_subnet', 'aws_security_group',
    'aws_future_service', 'aws_another_future_service', 'awscc_ec2_instance', 'random_id'];
  var state = {workspaces: [{name: 'types', nodes: types.map(function (type) {
    return {id: type + '.main', type: type, status: 'create'};
  })}]};
  types.forEach(function (type) {
    reviewService = type;
    var rows = sortedReviewRows(state);
    if (rows.length !== 1 || rows[0].node.type !== type) throw new Error('type filter merged ' + type);
  });
  reviewService = '';
});

check('map distinguishes direct dependencies from collapsed associations', function () {
  var ws = STATE.workspaces.find(function (w) { return w.name === 'platform'; });
  var links = buildMap(ws).links;
  var direct = links.find(function (l) { return l.from === 'aws_vpc.main' && l.to === 'aws_subnet.public[0]'; });
  var indirect = links.find(function (l) { return l.from === 'aws_subnet.public[0]' && l.to === 'aws_route_table.public'; });
  if (!direct || direct.indirect) throw new Error('direct VPC dependency marked indirect');
  if (!indirect || !indirect.indirect) throw new Error('collapsed route association marked direct');
});

check('focused relationships stay within the selected workspace and one hop', function () {
  var state = {workspaces: ['dev', 'prod'].map(function (name) { return {name: name,
    nodes: ['a', 'b', 'c'].map(function (id) { return {id: id, type: 'aws_future_service', status: 'existing'}; }),
    edges: [{from: 'a', to: 'b'}, {from: 'b', to: 'c'}]}; })};
  graphFocus = {workspace: 'prod', address: 'a'};
  var result = relationshipState(state);
  if (result.workspaces.length !== 1 || result.workspaces[0].name !== 'prod' || result.workspaces[0].nodes.length !== 2) {
    throw new Error('focus leaked workspace or transitive neighbor');
  }
  graphFocus = null;
});

// --- a whole estate: two VPCs and thirty-odd services --------------------
function estateMap() {
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'estate') return buildMap(STATE.workspaces[i]);
  }
  throw new Error('no estate workspace in fixtures');
}

check('two VPCs are drawn as two panels, each with its own subnets', function () {
  var m = estateMap();
  if (m.panels.length !== 2) throw new Error('want two VPC panels, got ' + m.panels.length);
  var byVpc = {};
  for (var i = 0; i < m.panels.length; i++) {
    byVpc[m.panels[i].vpc.id] = m.panels[i];
  }
  if (!byVpc['aws_vpc.app'] || !byVpc['aws_vpc.data']) {
    throw new Error('got panels for ' + Object.keys(byVpc).join(', '));
  }
  // A subnet belongs to exactly one of them, never to both.
  for (var j = 0; j < m.panels.length; j++) {
    var p = m.panels[j];
    for (var k = 0; k < p.subnets.length; k++) {
      var want = p.vpc.id === 'aws_vpc.app' ? 'app_' : 'data_';
      if (p.subnets[k].id.indexOf(want) === -1) {
        throw new Error(p.subnets[k].id + ' is drawn under ' + p.vpc.id);
      }
    }
  }
});

check('nothing certainly inside a VPC is filed as outside AWS', function () {
  var m = estateMap();
  var outside = m.scopes.external || [];
  if (outside.length) {
    throw new Error('filed outside AWS: ' + outside.map(function (n) { return n.id; }).join(', '));
  }
});

check('a listener with no target group still finds its load balancer', function () {
  // The redirect listener forwards nowhere, so it reaches its VPC only through
  // the balancer and that balancer's subnets — further than a short search.
  var m = estateMap();
  var stacks = [];
  for (var i = 0; i < m.panels.length; i++) stacks = stacks.concat(m.panels[i].lbs || []);
  var byLb = {};
  for (var j = 0; j < stacks.length; j++) byLb[stacks[j].lb.id] = stacks[j];
  var pub = byLb['aws_lb.public'];
  if (!pub) throw new Error('the public load balancer has no map');
  var ids = pub.listeners.map(function (n) { return n.id; }).sort();
  if (ids.join(',') !== 'aws_lb_listener.https,aws_lb_listener.redirect') {
    throw new Error('listeners are ' + ids.join(', '));
  }
});

check('what registers the targets is what the targets column shows', function () {
  var m = estateMap();
  var stacks = [];
  for (var i = 0; i < m.panels.length; i++) stacks = stacks.concat(m.panels[i].lbs || []);
  var pub = null;
  for (var j = 0; j < stacks.length; j++) if (stacks[j].lb.id === 'aws_lb.public') pub = stacks[j];
  var ids = pub.targets.map(function (n) { return n.id; }).sort().join(',');
  if (ids !== 'aws_autoscaling_group.worker,aws_ecs_service.api') {
    throw new Error('targets are ' + ids);
  }
  // An alarm reads a target group's metrics; it is not behind the group.
  for (var k = 0; k < pub.targets.length; k++) {
    if (pub.targets[k].type === 'aws_cloudwatch_metric_alarm') {
      throw new Error('an alarm was counted as a target');
    }
  }
});

check('an estate of thirty-odd services still renders', function () {
  filter.text = ''; filter.statuses = new Set();
  renderMap(STATE);
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('estate') === -1) throw new Error('the estate workspace did not render');
  var m = estateMap();
  var types = {};
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name !== 'estate') continue;
    var ns = STATE.workspaces[i].nodes;
    for (var j = 0; j < ns.length; j++) types[ns[j].type] = true;
  }
  var count = Object.keys(types).length;
  if (count < 45) throw new Error('want a broad estate, got ' + count + ' resource types');
});

async function checkDetailRequests() {
  var realFetch = fetch, pending = [];
  fetch = function () { return new Promise(function (resolve) { pending.push(resolve); }); };
  var response = function (name) {
    return { ok: true, json: async function () {
      return { type: 'aws_vpc', name: name, address: 'aws_vpc.' + name, status: 'existing', after: {} };
    } };
  };
  try {
    var opener = __allCards()[0]._detail;
    var old = openDetail('one', 'aws_vpc.old', opener);
    var current = openDetail('one', 'aws_vpc.current', opener);
    if (!$('drawer').open || document.activeElement !== $('dr-close')) throw new Error('dialog did not receive focus');
    pending[1](response('current'));
    await current;
    pending[0](response('old'));
    await old;
    if ($('dr-title').textContent !== 'VPC · current') throw new Error('stale response replaced current details');

    var closing = openDetail('one', 'aws_vpc.closing', opener);
    if ($('dr-pill').textContent !== '') throw new Error('old status leaked into loading state');
    closeDetail();
    pending[2](response('closing'));
    await closing;
    if ($('drawer').open || $('dr-title').textContent !== 'aws_vpc.closing') throw new Error('response updated closed drawer');
    if (document.activeElement !== opener) throw new Error('focus not restored');

    var failed = openDetail('one', 'aws_vpc.failed', opener);
    pending[3]({ ok: false, text: async function () { return '<unavailable>'; } });
    await failed;
    if (!$('dr-body').innerHTML.includes('&lt;unavailable&gt;')) throw new Error('error missing or unescaped');
    closeDetail();
    print('  ok   detail requests preserve current selection, errors and focus');
  } catch (err) {
    __failures++;
    print('  FAIL detail requests -> ' + err);
  } finally { fetch = realFetch; }
}

check('a plan is labelled with the tool that produced it', function () {
  // Terradune drives OpenTofu when Terraform is absent, so the header must not
  // call an OpenTofu plan Terraform.
  if (cliName({cli: 'tofu'}) !== 'OpenTofu') throw new Error('tofu is not named OpenTofu');
  if (cliName({cli: 'terraform'}) !== 'Terraform') throw new Error('terraform is misnamed');
  // A workspace planned before the tool was recorded still has to read sensibly.
  if (cliName({}) !== 'Terraform') throw new Error('an unrecorded tool lost its name');

  filter.text = ''; filter.statuses = new Set();
  var asTofu = Object.assign({}, STATE, {workspaces: STATE.workspaces.map(function (ws) {
    return Object.assign({}, ws, {cli: 'tofu', terraformVersion: '1.8.0'});
  })});
  renderMap(asTofu);
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('OpenTofu 1.8.0') === -1) throw new Error('the header does not name OpenTofu');
  if (h.indexOf('terraform 1.8.0') !== -1) throw new Error('the header still says terraform');
  renderMap(STATE);
});

// --- issue #23: for_each associations and the public/private label -------
check('for_each subnets reach their route table and read as public', function () {
  filter.text = ''; filter.statuses = new Set();
  var ws = null;
  for (var i = 0; i < STATE.workspaces.length; i++) {
    if (STATE.workspaces[i].name === 'foreach') ws = STATE.workspaces[i];
  }
  if (!ws) throw new Error('no foreach workspace in fixtures');
  var m = buildMap(ws);
  ['aws_subnet.public["0"]', 'aws_subnet.public["1"]'].forEach(function (id) {
    if (m.subnetPublic.get(id) !== true) {
      throw new Error(id + ' is not classified public: ' +
        JSON.stringify(Array.from(m.subnetPublic.entries())));
    }
  });
  // And the instance pairing held: each subnet is associated with the route
  // table by its own association, not by its sibling's.
  renderMap({workspaces: [ws]});
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('private') !== -1) throw new Error('a for_each subnet still reads private');
  renderMap(STATE);
});

check('a subnet with no known association claims neither public nor private', function () {
  // The plan can genuinely not know: no association resolved, ids unknown.
  var ws = {name: 'bare', nodes: [
    {id: 'aws_vpc.v', type: 'aws_vpc', name: 'v', module: '', status: 'create',
     meta: {provider: 'aws', scope: 'region'}},
    {id: 'aws_subnet.s', type: 'aws_subnet', name: 's', module: '', status: 'create',
     meta: {provider: 'aws', scope: 'vpc', cidr: '10.9.0.0/24'}},
  ], edges: [{from: 'aws_subnet.s', to: 'aws_vpc.v'}]};
  var m = buildMap(ws);
  if (m.subnetPublic.has('aws_subnet.s')) throw new Error('publicness invented from nothing');
  renderMap({workspaces: [ws]});
  var h = __sinks['mapbody'] || '';
  if (h.indexOf('private') !== -1 || h.indexOf('public ·') !== -1) {
    throw new Error('an unknowable subnet was labelled anyway');
  }
  if (h.indexOf('10.9.0.0/24') === -1) throw new Error('the cidr disappeared with the label');
  renderMap(STATE);
});

function checkConnectionChanges(name, fn) {
  check(name, function () {
    filter.text = ''; filter.statuses = new Set();
    reviewService = ''; reviewWorkspace = ''; changesOnly = false;
    try { fn(CONNECTION_STATE.workspaces[0]); }
    finally {
      filter.text = ''; filter.statuses = new Set();
      reviewService = ''; reviewWorkspace = ''; changesOnly = false;
    }
  });
}

checkConnectionChanges('unchanged parents expose attached changes without changing Terraform actions', function (ws) {
  var m = buildMap(ws);
  var routes = m.attachedChanges.get('aws_route_table.main');
  if (!routes || routes.length !== 5) throw new Error('route and association changes not attached');
  if (m.nodes.get('aws_route_table.main').status !== 'existing') throw new Error('invented route-table update');
  if (!m.attachedChanges.has('aws_security_group.app')) throw new Error('separate security-group rule lost');
  if (!m.attachedChanges.has('aws_lb_target_group.api')) throw new Error('target attachment deletion lost');
  if (!m.panels[0].routeTables.some(n => n.type === 'aws_default_route_table')) throw new Error('default route table not recognized');
});

checkConnectionChanges('changed collapsed resources remain inspectable even with unresolved endpoints', function () {
  renderMap(CONNECTION_STATE);
  var h = __sinks.mapbody;
  for (var address of ['aws_route.added', 'aws_route.updated', 'aws_route.removed', 'aws_route.replaced',
                       'aws_route.unresolved', 'aws_main_route_table_association.default', 'aws_lb_target_group_attachment.api']) {
    if (!h.includes('data-connection="' + address + '"')) throw new Error('missing connection row: ' + address);
  }
  if (!h.includes('5 attached changes')) throw new Error('route-table indicator missing');
  if (!h.includes('::/0')) throw new Error('deleted IPv6 route lost destination');
});

checkConnectionChanges('changes-only retains unchanged endpoints and load-balancer containers', function (ws) {
  changesOnly = true;
  var vis = visibleIn(ws, buildMap(ws));
  for (var address of ['aws_route_table.main', 'aws_vpc.main', 'aws_subnet.private',
                       'aws_nat_gateway.main', 'aws_lb.app', 'aws_lb_listener.http',
                       'aws_lb_target_group.api', 'aws_instance.api', 'aws_security_group.app']) {
    if (!vis.has(address)) throw new Error('lost context: ' + address);
  }
  renderMap(CONNECTION_STATE);
  if (!__sinks.mapbody.includes('data-id="aws_lb_target_group.api"')) throw new Error('load balancer panel was discarded');
  if (!__sinks.mapbody.includes('data-id="aws_route_table.main"')) throw new Error('route-table context not rendered');
  if (!__sinks.mapbody.includes('class="card existing"')) throw new Error('unchanged context was relabelled');
});

checkConnectionChanges('action filters keep the parent but exclude other connection actions', function () {
  filter.statuses = new Set(['destroy']);
  renderMap(CONNECTION_STATE);
  var h = __sinks.mapbody;
  if (!h.includes('data-id="aws_route_table.main"')) throw new Error('destroy lost unchanged parent');
  if (!h.includes('data-connection="aws_route.removed"')) throw new Error('destroyed route missing');
  if (h.includes('data-connection="aws_route.added"')) throw new Error('create leaked through destroy filter');
  if (!h.includes('1 attached change')) throw new Error('badge did not respect action filter');
});

checkConnectionChanges('changes-only excludes unrelated unchanged resources', function (ws) {
  var copy = JSON.parse(JSON.stringify(ws));
  copy.nodes.push({id: 'aws_s3_bucket.unrelated', type: 'aws_s3_bucket', status: 'existing'});
  changesOnly = true;
  var vis = visibleIn(copy, buildMap(copy));
  if (vis.has('aws_s3_bucket.unrelated')) throw new Error('unrelated unchanged resource leaked into context');
});

checkConnectionChanges('an unresolved connection alone is visible and expanded', function (ws) {
  var copy = JSON.parse(JSON.stringify(ws));
  copy.nodes = copy.nodes.filter(n => n.id === 'aws_route.unresolved');
  copy.edges = [];
  changesOnly = true;
  renderMap({workspaces: [copy]});
  if (!__sinks.mapbody.includes('data-connection="aws_route.unresolved"')) throw new Error('orphan change hidden');
  if (!__sinks.mapbody.includes('data-workspace="' + copy.name + '" open')) throw new Error('orphan change collapsed');
});

checkConnectionChanges('route search and resource-type filters retain relevant map context', function () {
  changesOnly = true; reviewService = 'aws_route'; filter.text = '10.50.0.0/16';
  renderMap(CONNECTION_STATE);
  if (!__sinks.mapbody.includes('data-id="aws_route_table.main"')) throw new Error('destination search lost route parent');
  if (!__sinks.mapbody.includes('data-connection="aws_route.added"')) throw new Error('destination search lost route');
  if (__sinks.mapbody.includes('data-connection="aws_route.updated"')) throw new Error('unrelated route matched');
  reviewService = 'aws_route_table'; filter.text = '';
  renderMap(CONNECTION_STATE);
  if (!__sinks.mapbody.includes('5 attached changes')) throw new Error('parent type filter hides attached changes');
  filter.text = 'no-such-resource';
  renderMap(CONNECTION_STATE);
  if (cardCount()) throw new Error('context survived an empty selection');
});

checkConnectionChanges('inline route-table updates stay visible without separate route resources', function (ws) {
  var standalone = JSON.parse(JSON.stringify(ws));
  standalone.nodes = standalone.nodes.filter(n => !GLUE.has(n.type));
  standalone.nodes.forEach(n => { n.status = n.id === 'aws_route_table.main' ? 'update' : 'existing'; });
  changesOnly = true;
  renderMap({workspaces: [standalone]});
  if (!__sinks.mapbody.includes('class="card update" data-id="aws_route_table.main"')) throw new Error('inline update hidden');
  if (!__sinks.mapbody.includes('data-id="aws_vpc.main"')) throw new Error('inline update lost containing VPC');
});

checkConnectionChanges('attached detail rows include diffs and deleted values', function () {
  var updated = relatedHTML({address: 'aws_route.updated', type: 'aws_route', status: 'update',
    before: {gateway_id: 'igw-old'}, after: {gateway_id: 'igw-new'}});
  if (!updated.includes('class="was"') || !updated.includes('igw-old') || !updated.includes('igw-new')) {
    throw new Error('attached route update lost before/after');
  }
  var removed = relatedHTML({address: 'aws_route.removed', type: 'aws_route', status: 'destroy',
    before: {destination_ipv6_cidr_block: '::/0', gateway_id: 'igw-old'}});
  if (!removed.includes('::/0') || !removed.includes('igw-old')) throw new Error('deleted route details empty');
  var unknown = attrRows({route: [{gateway_id: null}]}, {route: [{gateway_id: 'igw-old'}]}, ['route']);
  if (!unknown.includes('known after apply') || !unknown.includes('igw-old')) throw new Error('nested unknown change hidden');
});

checkConnectionChanges('dense subnets have bounded compact references and a complete natural-order inventory', function () {
  var ws = DENSE_STATE.workspaces[0], m = buildMap(ws), p = m.panels[0];
  if (p.inventory.filter(n => n.type === 'aws_instance').length !== 30) throw new Error('instances missing from inventory');
  var names = p.contents.get('aws_subnet.servers').map(displayName);
  if (names[1] !== 'server-02' || names[29] !== 'server-30') throw new Error('not naturally sorted');
  renderMap(DENSE_STATE);
  var h = __sinks.mapbody;
  if ((h.match(/data-compact="true"/g) || []).length !== 3) throw new Error('subnet preview is not bounded');
  if ((h.match(/data-inventory="true"/g) || []).length !== 31) throw new Error('inventory lost or duplicated resources');
  if (!h.includes('View all 30 resources')) throw new Error('missing expansion action');
  changesOnly = true;
  renderMap(DENSE_STATE);
  if (( __sinks.mapbody.match(/data-inventory="true"/g) || []).length !== 30) throw new Error('changes filter includes unchanged inventory');
});

checkConnectionChanges('dependency focus preserves changed attachments and real containers', function () {
  var ws = CONNECTION_STATE.workspaces[0], m = buildMap(ws);
  var visible = visibleIn(ws, m);
  var result = dependencyVisibility(m, visible, 'aws_route_table.main');
  if (!result.has('aws_route_table.main') || !result.has('aws_vpc.main')) throw new Error('missing parent context');
  for (var child of m.attachedChanges.get('aws_route_table.main') || []) {
    if (visible.has(child.id) && !result.has(child.id)) throw new Error('lost attached change');
  }
});

checkConnectionChanges('mixed VPC inventory follows placement groups without duplicating shared resources', function () {
  var ws = MIXED_STATE.workspaces[0], m = buildMap(ws);
  var p = m.panels.find(p => p.vpc.id === 'aws_vpc.main');
  for (var id of ['aws_db_instance.orders', 'aws_rds_cluster_instance.analytics', 'aws_ecs_service.api', 'aws_eks_fargate_profile.workers', 'aws_elasticache_cluster.cache']) {
    if ((m.subnetsByResource.get(id) || []).length !== 2) throw new Error('lost subnet-group placement: ' + id);
    if (p.inventory.filter(n => n.id === id).length !== 1) throw new Error('missing or duplicate inventory entry: ' + id);
  }
  if (p.inventory.some(n => /outside|aws_instance.other/.test(n.id))) throw new Error('unrelated resource placed in VPC');
  renderMap(MIXED_STATE);
  var h = __sinks.mapbody;
  for (var label of ['Compute &amp; containers', 'Databases &amp; caches', 'Storage', 'FARGATE', 'db.t4g.small']) {
    if (!h.includes(label)) throw new Error('missing inventory type or size: ' + label);
  }
  var key = resourceKey(ws.name, p.vpc.id);
  mapSubnetFilters.set(key, 'aws_subnet.secondary');
  try {
    var filtered = vpcInventoryHTML(p, m, new Set(ws.nodes.map(n => n.id)));
    if (filtered.includes('data-id="aws_instance.app"')) throw new Error('subnet filter leaked resource');
    if (!filtered.includes('data-id="aws_db_instance.orders"')) throw new Error('shared database lost from subnet filter');
  } finally { mapSubnetFilters.delete(key); }
});

checkConnectionChanges('subnet placement cannot follow unrelated resources or cycles', function () {
  var nodes = new Map([
    ['app', {type:'aws_ecs_service'}], ['db', {type:'aws_db_instance'}],
    ['a', {type:'aws_db_subnet_group'}], ['b', {type:'aws_db_subnet_group'}],
    ['subnet', {type:'aws_subnet'}],
  ]);
  var deps = new Map([['app',['db']], ['db',['a']], ['a',['b']], ['b',['a','subnet']]]);
  if (resourceSubnets('app', nodes, deps).length) throw new Error('app inherited database placement');
  if (resourceSubnets('db', nodes, deps).join() !== 'subnet') throw new Error('cyclic subnet group lost placement');
});

checkDetailRequests().then(function () {
  if (__failures) print('\n' + __failures + ' FAILURE(S)');
  else print('\nALL CHECKS PASSED');
});
