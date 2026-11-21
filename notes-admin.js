(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const repoPath = '/repos/jmleeaug/jmleeaug.github.io';
  const filePath = repoPath + '/contents/notes-data.js';
  const branch = 'main';
  let token = '', data = {version: 1, posts: []}, baseline = null, sha = '', active = null;
  let busy = false, pollGeneration = 0;

  function message(text) { $('message').textContent = text; }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function postTime(p) {
    for (const field of ['publishedAt', 'createdAt']) {
      const value = Date.parse(p[field] || '');
      if (Number.isFinite(value)) return value;
    }
    const match = /^p-([0-9a-z]+)-/i.exec(p.id || '');
    const value = match ? parseInt(match[1], 36) : NaN;
    return Number.isFinite(value) ? value : (Date.parse(p.date) || 0);
  }
  function newestFirst(a, b) { return postTime(b) - postTime(a); }
  function validate(x) {
    return x && x.version === 1 && Array.isArray(x.posts) && x.posts.length <= 10000 &&
      x.posts.every(p => p && typeof p.id === 'string' && p.id && typeof p.title === 'string' &&
        typeof p.body === 'string' && typeof p.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(p.date) &&
        (p.publishedAt === undefined || Number.isFinite(Date.parse(p.publishedAt)))) &&
      new Set(x.posts.map(p => p.id)).size === x.posts.length;
  }
  function parseFile(text) {
    const match = /^\s*window\.NOTES_DATA\s*=\s*([\s\S]*?)\s*;?\s*$/.exec(text);
    if (!match) throw new Error('최신 글 파일 형식을 확인할 수 없습니다.');
    const parsed = JSON.parse(match[1]);
    if (!validate(parsed)) throw new Error('게시글 파일의 형식이 올바르지 않습니다. 기존 파일은 변경하지 않았습니다.');
    return parsed;
  }
  function decode(text) {
    return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));
  }
  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  async function api(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch('https://api.github.com' + path, {
        ...options, cache: 'no-store', credentials: 'omit', signal: controller.signal,
        headers: {'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
          'Authorization': 'Bearer ' + token, ...(options.body ? {'Content-Type': 'application/json'} : {})}
      });
      if (!response.ok) {
        const error = new Error(response.status === 401 ? '연결 키가 만료됐거나 올바르지 않습니다. 연결을 해제한 뒤 새 키로 연결해주세요.' :
          response.status === 403 ? '이 저장소에 저장할 권한이 없거나 요청 제한에 걸렸습니다. 연결 키의 저장소 선택과 Contents 권한을 확인해주세요.' :
          response.status === 409 || response.status === 422 ? '저장 중 충돌이 발생했습니다. 다른 곳에서 글이 바뀌었을 수 있습니다. 편집 내용은 유지했습니다.' :
          'GitHub 요청에 실패했습니다. 잠시 뒤 다시 시도해주세요. (' + response.status + ')');
        error.status = response.status;
        throw error;
      }
      return await response.json();
    } finally { clearTimeout(timeout); }
  }
  async function readLatest() {
    const file = await api(filePath + '?ref=' + branch + '&fresh=' + Date.now());
    if (!file.sha || file.encoding !== 'base64' || typeof file.content !== 'string')
      throw new Error('전체 글 파일을 불러올 수 없어 게시를 중단했습니다.');
    return {sha: file.sha, data: parseFile(decode(file.content))};
  }
  function edited() { return baseline !== null && JSON.stringify(data) !== JSON.stringify(baseline); }
  function lock(value) {
    busy = value;
    for (const id of ['new','reload','publish','disconnect','title','date','body','delete','edit-tab','preview-tab','token','connect'])
      $(id).disabled = value;
    for (const button of $('posts').querySelectorAll('button')) button.disabled = value;
    if (!value) {
      for (const id of ['title','date','body','delete','edit-tab','preview-tab']) $(id).disabled = !active;
      $('publish').disabled = !token || !sha;
    }
  }
  function renderList() {
    $('posts').replaceChildren();
    for (const p of [...data.posts].sort(newestFirst)) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'post' + (p.id === active ? ' active' : '');
      button.append(document.createTextNode(p.title || '제목 없는 글'));
      const small = document.createElement('small'); small.textContent = p.date;
      button.append(small); button.onclick = () => { if (!busy) select(p.id); };
      $('posts').append(button);
    }
    if (!data.posts.length) $('posts').textContent = '아직 글이 없습니다.';
    $('state').textContent = '전체 ' + data.posts.length + '편 · ' + (edited() ? '게시하지 않은 변경이 있습니다.' : '저장소의 최신 상태입니다.');
  }
  function select(id) {
    active = id;
    const p = data.posts.find(p => p.id === id);
    for (const field of ['title','date','body']) $(field).value = p ? p[field] : '';
    $('form').hidden = false; $('preview').hidden = true;
    renderList(); lock(false);
  }
  function sync() {
    const p = data.posts.find(p => p.id === active);
    if (!p || busy) return;
    const before = JSON.stringify(p);
    for (const field of ['title','date','body']) p[field] = $(field).value;
    if (JSON.stringify(p) !== before) pollGeneration++;
    renderList();
  }
  function adopt(latest) {
    sha = latest.sha; data = clone(latest.data); data.posts.sort(newestFirst); baseline = clone(data);
    select(data.posts.some(p => p.id === active) ? active : data.posts[0]?.id || null);
  }
  function previewBody(text) {
    const container = $('preview-body'); container.replaceChildren();
    let end = 0;
    for (const match of text.matchAll(/https?:\/\/[^\s<>"'“”‘’]+/gi)) {
      const url = match[0].replace(/[.,!?;:。！？、]+$/u, '');
      container.append(document.createTextNode(text.slice(end, match.index)));
      const link = document.createElement('a'); link.href = url; link.textContent = url; link.rel = 'noreferrer';
      container.append(link); end = match.index + url.length;
    }
    container.append(document.createTextNode(text.slice(end)));
  }
  async function connect(event) {
    event.preventDefault(); if (busy) return;
    const supplied = $('token').value.trim(); $('token').value = '';
    if (!supplied) { message('연결 키를 입력해주세요.'); return; }
    token = supplied; lock(true); message('관리자 권한과 최신 글을 확인하는 중입니다.');
    try {
      const user = await api('/user');
      if (user.login?.toLowerCase() !== 'jmleeaug') throw new Error('이 편집기는 jmleeaug 계정만 연결할 수 있습니다.');
      const repo = await api(repoPath);
      if (!repo.permissions?.push) throw new Error('홈페이지 저장소에 쓰기 권한이 없습니다.');
      const latest = await readLatest(); adopt(latest);
      $('connection').hidden = true; $('workspace').hidden = false; $('account').textContent = 'jmleeaug · 연결됨';
      message('홈페이지의 최신 글 ' + data.posts.length + '편을 불러왔습니다.');
    } catch (error) {
      token = ''; sha = ''; baseline = null;
      message(error.name === 'AbortError' || error instanceof TypeError ? '연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해주세요.' : error.message);
    } finally { lock(false); }
  }
  async function reload() {
    if (busy) return;
    sync();
    if (edited() && !confirm('게시하지 않은 수정을 버리고 홈페이지의 최신 글을 다시 불러올까요?')) return;
    lock(true); message('최신 글을 불러오는 중입니다.');
    try { adopt(await readLatest()); message('최신 글 ' + data.posts.length + '편을 가져왔습니다.'); }
    catch (_) { message('최신 글을 가져오지 못했습니다. 현재 편집 내용은 유지했습니다.'); }
    finally { lock(false); }
  }
  function disconnect() {
    if (busy || (edited() && !confirm('게시하지 않은 변경을 버리고 연결을 해제할까요?'))) return;
    pollGeneration++; token = ''; sha = ''; active = null; baseline = null; data = {version: 1, posts: []};
    for (const id of ['token','title','date','body']) $(id).value = '';
    $('posts').replaceChildren(); $('preview-body').replaceChildren(); $('preview-title').textContent = '';
    $('account').textContent = ''; $('workspace').hidden = true; $('connection').hidden = false;
    message('연결을 해제했습니다. 연결 키는 보관하지 않습니다.');
  }
  function changes() {
    const old = new Map(baseline.posts.map(p => [p.id, p]));
    const current = new Map(data.posts.map(p => [p.id, p]));
    return {added: data.posts.filter(p => !old.has(p.id)).length,
      modified: data.posts.filter(p => old.has(p.id) && JSON.stringify(p) !== JSON.stringify(old.get(p.id))).length,
      removed: baseline.posts.filter(p => !current.has(p.id)).length};
  }
  function publicationData() {
    const result = clone(data), previous = new Map(baseline.posts.map(p => [p.id, p]));
    let last = Math.max(Date.now(), ...baseline.posts.map(postTime)) + 1;
    for (const p of [...result.posts].sort((a,b) => postTime(a) - postTime(b))) {
      if (previous.has(p.id)) {
        if (!p.publishedAt) p.publishedAt = new Date(postTime(previous.get(p.id))).toISOString();
      } else { p.publishedAt = new Date(last++).toISOString(); }
    }
    result.posts.sort(newestFirst);
    return result;
  }
  async function checkDeployment(expected, generation, attempt = 0) {
    if (generation !== pollGeneration || !token) return;
    try {
      const response = await fetch('https://jiminleemusic.com/notes-data.js?check=' + Date.now(), {cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000)});
      if (response.ok && JSON.stringify(parseFile(await response.text())) === JSON.stringify(expected)) {
        message('게시 완료 · 실제 홈페이지에 반영된 것까지 확인했습니다.'); return;
      }
    } catch (_) { /* Saved data remains safe even if the public site cannot be checked. */ }
    if (generation !== pollGeneration || !token) return;
    if (attempt >= 23) { message('GitHub 저장은 완료됐습니다. 홈페이지 반영은 아직 확인되지 않았습니다. 잠시 후 게시판을 확인해주세요.'); return; }
    setTimeout(() => checkDeployment(expected, generation, attempt + 1), 5000);
  }
  async function publish() {
    if (busy || !token || !sha || !baseline) return;
    sync();
    if (!validate(data) || data.posts.some(p => !p.title.trim() || !p.body.trim() || p.title.length > 300)) {
      message('모든 글의 제목·날짜·본문을 입력해주세요. 빈 새 글은 삭제할 수 있습니다.'); return;
    }
    const count = changes();
    if (!(count.added + count.modified + count.removed)) { message('게시할 변경이 없습니다.'); return; }
    if (!confirm('새 글 ' + count.added + '편 · 수정 ' + count.modified + '편 · 삭제 ' + count.removed + '편\n이 내용으로 홈페이지에 게시할까요?')) return;
    if (!data.posts.length && !confirm('게시판의 모든 글을 삭제합니다. 정말 진행할까요?')) return;
    pollGeneration++; lock(true); message('최신 상태를 확인하고 게시하는 중입니다.');
    const candidate = publicationData();
    try {
      const latest = await readLatest();
      if (latest.sha !== sha) throw new Error('다른 곳에서 글이 변경돼 덮어쓰기를 중단했습니다. 편집 내용은 남아 있습니다. 먼저 다른 창의 게시 작업을 확인해주세요.');
      const result = await api(filePath, {method: 'PUT', body: JSON.stringify({
        message: 'Update notes from admin editor', branch, sha,
        content: encode('window.NOTES_DATA = ' + JSON.stringify(candidate, null, 2) + ';\n')
      })});
      if (!result.content?.sha) throw new Error('저장 결과를 확인할 수 없습니다.');
      adopt({sha: result.content.sha, data: candidate});
      message('GitHub에 저장했습니다. 홈페이지 반영을 확인하는 중입니다.');
      checkDeployment(candidate, pollGeneration);
    } catch (error) {
      // A disconnected response does not mean a write failed: read back before permitting a retry.
      try {
        const latest = await readLatest();
        if (JSON.stringify(latest.data) === JSON.stringify(candidate)) {
          adopt(latest); message('GitHub 저장을 확인했습니다. 홈페이지 반영을 확인하는 중입니다.');
          checkDeployment(candidate, pollGeneration); return;
        }
      } catch (_) { /* Keep local edits; never overwrite unknown remote state. */ }
      message(error.name === 'AbortError' || error instanceof TypeError ? '통신이 끊겨 저장 결과를 확인하지 못했습니다. 편집 내용은 유지했습니다. 창을 닫지 말고 연결을 확인한 뒤 다시 시도해주세요.' : error.message);
    } finally { lock(false); }
  }
  $('connect-form').addEventListener('submit', connect);
  $('reload').onclick = reload; $('disconnect').onclick = disconnect; $('publish').onclick = publish;
  $('new').onclick = () => {
    if (busy) return;
    const now = Date.now();
    const p = {id: 'p-' + now.toString(36) + '-' + crypto.randomUUID().slice(0,8), title: '', date: today(), body: '', createdAt: new Date(now).toISOString()};
    data.posts.push(p); select(p.id); $('title').focus();
  };
  $('delete').onclick = () => {
    if (busy || !active || !confirm('이 글을 삭제 목록에 넣을까요? 게시 버튼을 눌러야 홈페이지에서도 삭제됩니다.')) return;
    data.posts = data.posts.filter(p => p.id !== active); select(data.posts[0]?.id || null);
  };
  for (const field of ['title','date','body']) $(field).addEventListener('input', sync);
  $('edit-tab').onclick = () => { $('form').hidden = false; $('preview').hidden = true; };
  $('preview-tab').onclick = () => {
    sync(); $('preview-title').textContent = $('title').value; $('preview-date').textContent = $('date').value;
    previewBody($('body').value); $('form').hidden = true; $('preview').hidden = false;
  };
  window.addEventListener('beforeunload', event => {
    if (edited() || busy) { event.preventDefault(); event.returnValue = ''; }
  });
  window.addEventListener('pagehide', () => { token = ''; pollGeneration++; });
  window.addEventListener('pageshow', event => { if (event.persisted) { token = ''; sha = ''; $('workspace').hidden = true; $('connection').hidden = false; message('다시 연결해주세요.'); } });
  lock(false);
})();
