// csv-reader-speed-01: a fast drop-in for make.fun's csv-reader 1.0.0.
//
// run(input) returns exactly csv-reader 1.0.0's answer for {text, header}:
// {columns, rows, errors}. Same broken-row policy: a U+FEFF at the start is
// dropped, a record ends at LF or CRLF, a line left with no characters is no
// record, a CR outside quotes that is not followed by LF is dropped (stray_cr),
// a field that opens with a quote runs to the next undoubled quote ("" inside
// is one quote, CRLF or a lone CR inside is read as LF), what follows its
// closing quote up to the next comma or line break is appended as it stands
// (quote_junk), a quote that never closes is a literal character and the text
// after it is read again as unquoted (unterminated_quote), a quote inside an
// unquoted field is literal, fields stay strings, rows are padded with "" or
// cut to the first record's width (short_row / long_row).
//
// Speed comes from never reading a character twice in the common case. The
// parser keeps two monotonic cursors — the next LF and the next CR at or
// after the current position — which only ever move forward, so finding the
// next delimiter costs one indexOf(',') per unquoted field and the cursor
// scans amortise to a single pass over the text. A quoted field is
// resolved with indexOf('"') (doubled quotes skipped), and its value is a
// plain slice unless it holds a doubled quote, a CR or a line break, in which
// case a small builder handles it. Only the rare paths — a stray CR, junk
// after a closing quote, an unterminated quote — fall back to a chunked
// rescan (scanUnquoted). No dependencies, no allocations beyond the answer.
//
// SPDX-License-Identifier: MIT

const COMMA = 0, LB = 1, END = 2;

// Unquoted scan from pos with initial value v0. Returns [value, ended, pos, line, nl, cr].
// Rare path only (stray CR, junk after a quote, unterminated re-read).
function scanUnquoted(text, n, pos, line, nl, cr, recordLine, recordRow, errors, v0) {
  let value = v0;
  for (;;) {
    if (cr < pos) { cr = text.indexOf('\r', pos); if (cr === -1) cr = n; }
    if (nl < pos) { nl = text.indexOf('\n', pos); if (nl === -1) nl = n; }
    let comma = text.indexOf(',', pos); if (comma === -1) comma = n;
    if (cr < n && cr <= comma && cr <= nl) {
      if (cr + 1 === nl && nl < n) {
        value = value ? value + text.slice(pos, cr) : text.slice(pos, cr);
        pos = nl + 1; line++;
        return [value, LB, pos, line, nl, cr];
      }
      value = value ? value + text.slice(pos, cr) : text.slice(pos, cr);
      errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      pos = cr + 1;
      continue;
    }
    if (comma < n && comma <= nl) {
      value = value ? value + text.slice(pos, comma) : text.slice(pos, comma);
      pos = comma + 1;
      return [value, COMMA, pos, line, nl, cr];
    }
    if (nl < n) {
      value = value ? value + text.slice(pos, nl) : text.slice(pos, nl);
      pos = nl + 1; line++;
      return [value, LB, pos, line, nl, cr];
    }
    value = value ? value + text.slice(pos) : text.slice(pos);
    pos = n;
    return [value, END, pos, line, nl, cr];
  }
}

// Count occurrences of char code `cc` in text[start, end) via indexOf.
function countChar(text, cc, start, end) {
  let c = 0, p = start;
  for (;;) {
    p = text.indexOf(cc, p);
    if (p === -1 || p >= end) return c;
    c++; p++;
  }
}

// Build a quoted field's value from segment [start, end). Handles doubled quotes,
// CR/CRLF -> LF, and counts line breaks. Returns [value, lineDelta].
function buildQuoted(text, start, end, doubled) {
  let value = '';
  let lines = 0;
  let p = start;
  while (p < end) {
    const c = text.charCodeAt(p);
    if (c === 34) { // doubled quote (a lone quote cannot occur inside the segment)
      value += '"'; p += 2; continue;
    }
    if (c === 13) {
      value += '\n'; lines++;
      p += (text.charCodeAt(p + 1) === 10) ? 2 : 1;
      continue;
    }
    if (c === 10) lines++;
    value += text[p]; p++;
  }
  return [value, lines];
}

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  let pos = 0;
  let line = 1;
  if (n > 0 && text.charCodeAt(0) === 0xFEFF) pos = 1;
  let nl = text.indexOf('\n', pos); if (nl === -1) nl = n;
  let cr = text.indexOf('\r', pos); if (cr === -1) cr = n;

  while (true) {
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) { pos++; line++; }
      else if (c === 13 && text.charCodeAt(pos + 1) === 10) { pos += 2; line++; }
      else break;
    }
    if (pos >= n) break;
    const recordLine = line;
    const recordRow = (header && columns === null) ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    let ended = COMMA;

    fieldLoop: while (true) {
      if (nl < pos) { nl = text.indexOf('\n', pos); if (nl === -1) nl = n; }
      if (cr < pos) { cr = text.indexOf('\r', pos); if (cr === -1) cr = n; }
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        const open = pos;
        let q = text.indexOf('"', pos + 1);
        let doubled = false;
        while (q !== -1 && text.charCodeAt(q + 1) === 34) { doubled = true; q = text.indexOf('"', q + 2); }
        if (q === -1) {
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          pos = open + 1;
          const r = scanUnquoted(text, n, pos, line, nl, cr, recordLine, recordRow, errors, '"');
          fields.push(r[0]); ended = r[1]; pos = r[2]; line = r[3]; nl = r[4]; cr = r[5];
          if (ended === COMMA) continue fieldLoop;
          break fieldLoop;
        }
        let value;
        const segHasCR = cr < q;
        const segHasNL = nl < q;
        if (!doubled && !segHasCR && !segHasNL) {
          value = text.slice(open + 1, q);
        } else if (!doubled && !segHasCR) {
          value = text.slice(open + 1, q);
          line += countChar(text, '\n', open + 1, q);
        } else if (!doubled && !segHasNL) {
          value = text.slice(open + 1, q).replace(/\r/g, '\n');
          line += countChar(text, '\r', open + 1, q);
        } else if (doubled && !segHasCR && !segHasNL) {
          value = text.slice(open + 1, q).split('""').join('"');
        } else {
          const b = buildQuoted(text, open + 1, q, doubled);
          value = b[0]; line += b[1];
        }
        pos = q + 1;
        if (pos >= n) { fields.push(value); ended = END; break fieldLoop; }
        const c = text.charCodeAt(pos);
        if (c === 44) { fields.push(value); pos++; ended = COMMA; continue fieldLoop; }
        if (c === 10) { fields.push(value); pos++; line++; ended = LB; break fieldLoop; }
        if (c === 13 && text.charCodeAt(pos + 1) === 10) { fields.push(value); pos += 2; line++; ended = LB; break fieldLoop; }
        // junk after the closing quote: read unquoted with the value so far
        const r = scanUnquoted(text, n, pos, line, nl, cr, recordLine, recordRow, errors, value);
        if (r[0].length > value.length) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        fields.push(r[0]); ended = r[1]; pos = r[2]; line = r[3]; nl = r[4]; cr = r[5];
        if (ended === COMMA) continue fieldLoop;
        break fieldLoop;
      }
      // unquoted field, fast path (initial value '')
      lastQuoted = false;
      let comma = text.indexOf(',', pos); if (comma === -1) comma = n;
      if (cr < n && cr <= comma && cr <= nl) {
        if (cr + 1 === nl && nl < n) {
          fields.push(text.slice(pos, cr));
          pos = nl + 1; line++; ended = LB; break fieldLoop;
        }
        // stray CR: rare path
        const r = scanUnquoted(text, n, pos, line, nl, cr, recordLine, recordRow, errors, '');
        fields.push(r[0]); ended = r[1]; pos = r[2]; line = r[3]; nl = r[4]; cr = r[5];
        if (ended === COMMA) continue fieldLoop;
        break fieldLoop;
      }
      if (comma < n && comma <= nl) {
        fields.push(text.slice(pos, comma));
        pos = comma + 1; ended = COMMA; continue fieldLoop;
      }
      if (nl < n) {
        fields.push(text.slice(pos, nl));
        pos = nl + 1; line++; ended = LB; break fieldLoop;
      }
      fields.push(text.slice(pos));
      pos = n; ended = END; break fieldLoop;
    }

    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;
    if (width < 0) width = fields.length;
    if (header && columns === null) { columns = fields; continue; }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
