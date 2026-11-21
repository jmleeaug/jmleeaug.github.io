(()=>{'use strict';const data=window.NOTES_DATA;const rows=document.getElementById('note-rows'),list=document.getElementById('notes-list'),article=document.getElementById('note-article');const posts=Array.isArray(data?.posts)?data.posts.filter(p=>p&&typeof p.id==='string'&&typeof p.title==='string'&&typeof p.body==='string'&&typeof p.date==='string'):[];function postTime(p){
 const published=Date.parse(p.publishedAt||'');
 if(Number.isFinite(published))return published;
 const created=Date.parse(p.createdAt||'');
 if(Number.isFinite(created))return created;
 const match=/^p-([0-9a-z]+)-/i.exec(p.id||'');
 const legacy=match?parseInt(match[1],36):NaN;
 return Number.isFinite(legacy)?legacy:(Date.parse(p.date)||0);
}
function newestFirst(a,b){return postTime(b)-postTime(a)}
posts.sort(newestFirst);function renderBody(container,text){
container.replaceChildren();
const pattern=/https?:\/\/[^\s<>"'“”‘’]+/gi;
let end=0;
for(const match of text.matchAll(pattern)){
 const raw=match[0];
 const url=raw.replace(/[.,!?;:。！？、]+$/u,'');
 container.append(document.createTextNode(text.slice(end,match.index)));
 const link=document.createElement('a');link.href=url;link.textContent=url;link.rel='noreferrer';link.style.overflowWrap='anywhere';container.append(link);
 end=match.index+url.length;
}
container.append(document.createTextNode(text.slice(end)));
}
function render(){const id=new URLSearchParams(location.hash.slice(1)).get('post');list.hidden=Boolean(id);article.hidden=!id;if(id){const post=posts.find(p=>p.id===id);document.getElementById('note-title').textContent=post?post.title:'글을 찾을 수 없습니다';document.getElementById('note-date').textContent=post?post.date:'';renderBody(document.getElementById('note-body'),post?post.body:'목록으로 돌아가 주세요.');document.title=(post?post.title:'notes')+' | jimin lee music';}else{document.title='notes | jimin lee music';rows.replaceChildren();if(!posts.length){const p=document.createElement('p');p.className='note-empty';p.textContent='아직 등록된 글이 없습니다.';rows.append(p);}for(const post of posts){const row=document.createElement('div');row.className='note-row';const time=document.createElement('time');time.className='note-date';time.dateTime=post.date;time.textContent=post.date;const a=document.createElement('a');a.href='#post='+encodeURIComponent(post.id);a.textContent=post.title;row.append(time,a);rows.append(row);}}}window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0)});render();const header=document.querySelector('.sidebar');function measure(){document.documentElement.style.setProperty('--mobile-header-height',header.getBoundingClientRect().height+'px')}if('ResizeObserver'in window)new ResizeObserver(measure).observe(header);window.addEventListener('resize',measure);measure();})();

/* Private-dashboard analytics: count valid articles without displaying a counter. */
(()=>{'use strict';
 if(!['jiminleemusic.com','www.jiminleemusic.com','jmleeaug.github.io'].includes(location.hostname))return;
 window.goatcounter={no_onload:true};
 function countArticle(){
  const id=new URLSearchParams(location.hash.slice(1)).get('post');
  const posts=window.NOTES_DATA?.posts;
  const post=Array.isArray(posts)?posts.find(p=>p&&p.id===id&&typeof p.title==='string'&&typeof p.body==='string'&&typeof p.date==='string'):null;
  if(!post||typeof window.goatcounter.count!=='function')return;
  window.goatcounter.count({path:location.pathname+'#post='+encodeURIComponent(post.id),title:post.title.trim()+' | notes',referrer:''});
 }
 const script=document.createElement('script');
 script.async=true;
 script.src='https://gc.zgo.at/count.js';
 script.setAttribute('data-goatcounter','https://jmleeaug.goatcounter.com/count');
 script.onload=()=>{if(typeof window.goatcounter.count==='function'){window.goatcounter.count({path:'/notes.html',title:'게시판 방문',referrer:''});countArticle();}};
 window.addEventListener('hashchange',countArticle);
 document.head.append(script);
})();
