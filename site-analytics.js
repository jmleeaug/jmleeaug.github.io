(()=>{'use strict';
if(!['jiminleemusic.com','www.jiminleemusic.com','jmleeaug.github.io'].includes(location.hostname))return;
const home=location.pathname==='/'||location.pathname==='/index.html';
window.goatcounter={path:home?'/':location.pathname,title:home?'홈페이지 방문':'dates 방문',referrer:''};
const script=document.createElement('script');script.async=true;script.src='https://gc.zgo.at/count.js';script.setAttribute('data-goatcounter','https://jmleeaug.goatcounter.com/count');document.head.append(script);
})();
