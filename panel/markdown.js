// Small Markdown renderer for chat replies: headings, lists, code, tables, quotes, links
(function (global) {
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function inline(text) {
    var codes = [];
    var s = text.replace(/`([^`\n]+)`/g, function (_, code) {
      codes.push('<code>' + escapeHtml(code) + '</code>');
      return '\u0000' + (codes.length - 1) + '\u0000';
    });
    s = escapeHtml(s);
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, label, href) {
      if (/^https?:\/\//.test(href)) {
        return '<a href="#" data-href="' + href + '">' + label + '</a>';
      }
      return '<span class="path">' + label + '</span>';
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    return s.replace(/\u0000(\d+)\u0000/g, function (_, i) { return codes[+i]; });
  }

  function isTableSep(line) {
    return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
  }

  function splitRow(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
  }

  function render(md) {
    var lines = md.replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];

      var fence = line.match(/^\s*(```|~~~)\s*([\w+-]*)/);
      if (fence) {
        var code = [];
        i++;
        while (i < lines.length && lines[i].trim().indexOf(fence[1]) !== 0) {
          code.push(lines[i]);
          i++;
        }
        i++;
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }

      if (/^\s*$/.test(line)) { i++; continue; }

      var heading = line.match(/^(#{1,6})\s+(.*)$/);
      if (heading) {
        var level = Math.min(heading[1].length + 2, 6);
        out.push('<h' + level + '>' + inline(heading[2]) + '</h' + level + '>');
        i++;
        continue;
      }

      if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { out.push('<hr>'); i++; continue; }

      if (line.indexOf('|') >= 0 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var head = splitRow(line);
        i += 2;
        var rows = [];
        while (i < lines.length && lines[i].indexOf('|') >= 0 && lines[i].trim()) {
          rows.push(splitRow(lines[i]));
          i++;
        }
        out.push('<div class="table-wrap"><table><thead><tr>' + head.map(function (c) { return '<th>' + inline(c) + '</th>'; }).join('') +
          '</tr></thead><tbody>' + rows.map(function (r) {
            return '<tr>' + r.map(function (c) { return '<td>' + inline(c) + '</td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table></div>');
        continue;
      }

      if (/^\s*>/.test(line)) {
        var quote = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + render(quote.join('\n')) + '</blockquote>');
        continue;
      }

      var listMatch = line.match(/^(\s*)([-*+]|\d+[.)])\s+/);
      if (listMatch) {
        var ordered = /\d/.test(listMatch[2]);
        var items = [];
        while (i < lines.length) {
          var m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (m && m[1].length <= listMatch[1].length) {
            items.push([m[3]]);
            i++;
          } else if (items.length && /^\s+\S/.test(lines[i])) {
            items[items.length - 1].push(lines[i].replace(/^\s{1,4}/, ''));
            i++;
          } else if (items.length && /^\s*$/.test(lines[i]) && i + 1 < lines.length && /^(\s*)([-*+]|\d+[.)])\s+/.test(lines[i + 1])) {
            i++;
          } else {
            break;
          }
        }
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.map(function (it) {
          var body = it.length > 1 ? render(it.join('\n')) : inline(it[0]);
          return '<li>' + body + '</li>';
        }).join('') + '</' + tag + '>');
        continue;
      }

      var para = [];
      while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|\s*```|\s*~~~|\s*>|\s*([-*+]|\d+[.)])\s+)/.test(lines[i])) {
        para.push(lines[i]);
        i++;
      }
      if (!para.length) { para.push(lines[i]); i++; }
      out.push('<p>' + inline(para.join('\n')).replace(/\n/g, '<br>') + '</p>');
    }
    return out.join('');
  }

  global.renderMarkdown = render;
  global.escapeHtml = escapeHtml;
})(window);
