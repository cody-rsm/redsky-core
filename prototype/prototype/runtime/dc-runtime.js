/*
 * dc-runtime.js — a minimal, dependency-free (besides React 18) renderer for the
 * ".dc.html" Design Component format used by the RedSky prototype.
 *
 * It lets the exact prototype source run as a normal web page, outside the design
 * canvas. It is a prototype harness, NOT production architecture — see docs/SPEC.md
 * for how the production app should be structured.
 *
 * Template features supported (everything the prototype uses):
 *   {{ path.to.value }}            dotted lookups (text, whole attributes, interpolated strings)
 *   <sc-if value="{{cond}}">       conditional block
 *   <sc-for list="{{xs}}" as="x">  repeat block ($index available)
 *   onClick / onChange / …         event handlers (functions returned from renderVals)
 *   ref="{{fn}}"                   callback refs
 *   style="a:b; c:{{d}}"           inline styles (converted to React style objects)
 */
(function () {
  'use strict';
  var React = window.React;

  // HTML parsing lowercases attribute names; map them back to React prop names.
  var ATTR_MAP = {
    'class': 'className', 'for': 'htmlFor', 'tabindex': 'tabIndex', 'readonly': 'readOnly',
    'maxlength': 'maxLength', 'autocomplete': 'autoComplete', 'autofocus': 'autoFocus',
    'colspan': 'colSpan', 'rowspan': 'rowSpan', 'spellcheck': 'spellCheck', 'contenteditable': 'contentEditable',
    'crossorigin': 'crossOrigin', 'enctype': 'encType', 'formaction': 'formAction', 'srcset': 'srcSet',
    'viewbox': 'viewBox', 'preserveaspectratio': 'preserveAspectRatio'
  };
  var EVENT_MAP = {
    onclick: 'onClick', ondblclick: 'onDoubleClick', onchange: 'onChange', oninput: 'onInput', onsubmit: 'onSubmit',
    onkeydown: 'onKeyDown', onkeyup: 'onKeyUp', onkeypress: 'onKeyPress', onfocus: 'onFocus', onblur: 'onBlur',
    onmouseenter: 'onMouseEnter', onmouseleave: 'onMouseLeave', onmousemove: 'onMouseMove', onmousedown: 'onMouseDown', onmouseup: 'onMouseUp',
    ondragstart: 'onDragStart', ondragover: 'onDragOver', ondragleave: 'onDragLeave', ondragenter: 'onDragEnter', ondrop: 'onDrop', ondragend: 'onDragEnd',
    onscroll: 'onScroll', onwheel: 'onWheel', onpointerdown: 'onPointerDown', onpointerup: 'onPointerUp', oncontextmenu: 'onContextMenu'
  };

  var HOLE_ONLY = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  var HOLE_ANY = /\{\{\s*([^}]+?)\s*\}\}/g;

  function camel(s) { return s.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); }); }

  function lookup(scope, path) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return Number(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    var parts = path.split('.');
    var cur = scope;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function interp(str, scope) {
    return str.replace(HOLE_ANY, function (m, p) { var v = lookup(scope, p); return v == null ? '' : String(v); });
  }

  function resolveAttr(raw, scope) {
    var m = raw.match(HOLE_ONLY);
    if (m) return lookup(scope, m[1]);
    if (raw.indexOf('{{') >= 0) return interp(raw, scope);
    return raw;
  }

  function styleObj(str) {
    var out = {};
    str.split(';').forEach(function (decl) {
      var i = decl.indexOf(':');
      if (i < 0) return;
      var k = decl.slice(0, i).trim(); var v = decl.slice(i + 1).trim();
      if (!k) return;
      out[k.indexOf('--') === 0 ? k : camel(k)] = v;
    });
    return out;
  }

  function propName(name, isSvg) {
    var lower = name.toLowerCase();
    if (EVENT_MAP[lower]) return EVENT_MAP[lower];
    if (ATTR_MAP[lower]) return ATTR_MAP[lower];
    if (lower.indexOf('data-') === 0 || lower.indexOf('aria-') === 0) return lower;
    if (name.indexOf('-') > 0 && isSvg) return camel(name);
    if (name === 'paint-order') return 'paintOrder';
    return name;
  }

  // Compile a DOM node into a render function (scope) -> React node(s)
  function compile(node, isSvg) {
    if (node.nodeType === 3) {
      var text = node.nodeValue;
      if (!text.trim()) return text.indexOf('\n') >= 0 ? null : function () { return text; };
      if (text.indexOf('{{') < 0) return function () { return text; };
      var m = text.match(HOLE_ONLY);
      if (m) { var p = m[1]; return function (scope) { var v = lookup(scope, p); return v == null ? '' : (typeof v === 'object' ? '' : v); }; }
      return function (scope) { return interp(text, scope); };
    }
    if (node.nodeType !== 1) return null;
    var tag = node.tagName;
    var lowerTag = tag.toLowerCase();
    var svg = isSvg || lowerTag === 'svg';
    var kids = [];
    var src = lowerTag === 'template' ? node.content.childNodes : node.childNodes;
    for (var i = 0; i < src.length; i++) { var c = compile(src[i], svg && lowerTag !== 'foreignobject'); if (c) kids.push(c); }
    function renderKids(scope) {
      var out = [];
      for (var j = 0; j < kids.length; j++) {
        var r = kids[j](scope);
        if (Array.isArray(r)) { for (var k = 0; k < r.length; k++) out.push(r[k]); } else if (r !== null && r !== undefined && r !== false) out.push(r);
      }
      return out;
    }
    if (lowerTag === 'sc-if') {
      var cond = node.getAttribute('value') || '';
      return function (scope) { return resolveAttr(cond, scope) ? renderKids(scope) : null; };
    }
    if (lowerTag === 'sc-for') {
      var listExpr = node.getAttribute('list') || '';
      var as = node.getAttribute('as') || 'item';
      return function (scope) {
        var list = resolveAttr(listExpr, scope) || [];
        var out = [];
        for (var n = 0; n < list.length; n++) {
          var child = Object.create(scope); child[as] = list[n]; child.$index = n;
          out.push(React.createElement(React.Fragment, { key: n }, renderKids(child)));
        }
        return out;
      };
    }
    if (lowerTag === 'helmet') return null;
    var attrs = [];
    for (var a = 0; a < node.attributes.length; a++) {
      var at = node.attributes[a];
      if (at.name.indexOf('hint-') === 0) continue;
      attrs.push({ name: propName(at.name, svg), raw: at.value });
    }
    var type = svg ? tag : lowerTag;
    return function (scope) {
      var props = {};
      for (var q = 0; q < attrs.length; q++) {
        var v = resolveAttr(attrs[q].raw, scope);
        if (attrs[q].name === 'style') { props.style = typeof v === 'string' ? styleObj(v) : v; continue; }
        if (v === undefined) continue;
        props[attrs[q].name] = v;
      }
      if ((type === 'input' || type === 'textarea' || type === 'select') && 'value' in props && !props.onChange && !props.readOnly) props.readOnly = true;
      if (type === 'textarea' || type === 'input') return React.createElement(type, props);
      return React.createElement.apply(null, [type, props].concat(renderKids(scope)));
    };
  }

  window.DCRuntime = {
    mount: function (opts) {
      var tpl = document.getElementById(opts.templateId);
      var roots = [];
      var nodes = tpl.content.childNodes;
      for (var i = 0; i < nodes.length; i++) { var c = compile(nodes[i], false); if (c) roots.push(c); }
      function renderAll(vals) {
        var out = [];
        roots.forEach(function (r) { var x = r(vals); if (Array.isArray(x)) out = out.concat(x); else if (x) out.push(x); });
        return React.createElement.apply(null, [React.Fragment, null].concat(out));
      }
      window.DCLogic = class DCLogic extends React.Component {
        render() { return renderAll(this.renderVals ? this.renderVals() : {}); }
      };
      var Component = opts.getComponent();
      var root = window.ReactDOM.createRoot(document.getElementById(opts.mountId));
      root.render(React.createElement(Component, opts.props || {}));
    }
  };
})();
