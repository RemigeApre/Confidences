(function(){var e=5,a="lq_nav_stack",o="lq_nav_back";function c(){try{return JSON.parse(sessionStorage.getItem(a)||"[]")}catch{return[]}}function l(h){try{sessionStorage.setItem(a,JSON.stringify(h))}catch{}}var s=location.pathname+location.search,d=c(),m=sessionStorage.getItem(o)==="1";if(m)try{sessionStorage.removeItem(o)}catch{}else(!d.length||d[d.length-1]!==s)&&(d.push(s),d.length>e&&(d=d.slice(d.length-e)),l(d));var y=document.querySelector(".nav-back-btn");y&&(d.length>=2&&(y.href=d[d.length-2]),y.addEventListener("click",function(h){var v=c();if(v.length>=2){h.preventDefault();var u=v[v.length-2];v.pop(),l(v);try{sessionStorage.setItem(o,"1")}catch{}window.location.href=u}}))})(),(function(){var e=document.getElementById("mobile-filter-toggle"),a=document.getElementById("mobile-filter-sidebar"),o=document.getElementById("mobile-filter-backdrop"),c=document.getElementById("mobile-filter-close");if(!e||!a||!o)return;window.matchMedia&&window.matchMedia("(max-width: 640px)").matches&&a.querySelectorAll("details").forEach(function(d){d.open=!0});function l(){a.classList.add("mobile-filter-open"),o.classList.add("open"),e.setAttribute("aria-expanded","true"),document.body.classList.add("nav-drawer-locked")}function s(){a.classList.remove("mobile-filter-open"),o.classList.remove("open"),e.setAttribute("aria-expanded","false"),document.body.classList.remove("nav-drawer-locked")}e.addEventListener("click",l),o.addEventListener("click",s),c&&c.addEventListener("click",s),document.addEventListener("keydown",function(d){d.key==="Escape"&&s()})})(),(function(){var e=document.getElementById("pc-search-inline"),a=document.getElementById("pc-search-input"),o=document.getElementById("pc-search-results"),c=document.getElementById("pc-search-btn");if(!e||!a||!o||!c)return;function l(){return e.classList.contains("pc-search-open")}function s(){e.classList.add("pc-search-open"),c.setAttribute("aria-expanded","true"),a.focus()}function d(){e.classList.remove("pc-search-open"),c.setAttribute("aria-expanded","false"),o.hidden=!0,o.innerHTML="",a.value=""}c.addEventListener("click",function(){l()?d():s()}),document.addEventListener("click",function(u){l()&&!e.contains(u.target)&&d()}),document.addEventListener("keydown",function(u){u.key==="k"&&(u.ctrlKey||u.metaKey)&&(u.preventDefault(),s()),u.key==="Escape"&&l()&&d()});var m;a.addEventListener("input",function(){clearTimeout(m);var u=a.value.trim();if(u.length<2){o.hidden=!0,o.innerHTML="";return}m=setTimeout(function(){y(u)},280)});function y(u){fetch("/api/search?q="+encodeURIComponent(u)).then(function(g){return g.json()}).then(function(g){v(g.results||{})}).catch(function(){})}var h={wiki:"Codex",galerie:"Galerie",bd:"BD",liens:"Liens",quizz:"Quizz"};function v(u){for(;o.firstChild;)o.removeChild(o.firstChild);o.hidden=!1;var g=Object.keys(u);if(!g.length){var I=document.createElement("p");I.className="pc-search-empty",I.textContent="Aucun r\xE9sultat",o.appendChild(I);return}g.forEach(function(L){var T=u[L],w=document.createElement("div");w.className="pc-search-section";var r=document.createElement("div");r.className="pc-search-section-label",r.textContent=h[L]||L,w.appendChild(r),T.forEach(function(f){var t=document.createElement("a");t.className="pc-search-result-link",t.href=f.url,t.textContent=f.title,t.addEventListener("click",d),w.appendChild(t)}),o.appendChild(w)})}})(),(function(){var e=document.querySelectorAll(".pc-hover-menu");e.length&&e.forEach(function(a){var o=a.tagName==="DETAILS",c=a.querySelector(o?":scope > summary":":scope > button, :scope > a");if(!c)return;var l=!1,s=null;function d(m){o&&(a.open=m),a.classList.toggle("pc-menu-open",m)}a.addEventListener("mouseenter",function(){clearTimeout(s),d(!0)}),a.addEventListener("mouseleave",function(){l||(s=setTimeout(function(){d(!1)},300))}),c.addEventListener("click",function(m){o&&m.preventDefault(),clearTimeout(s),l=!l,d(l)}),document.addEventListener("click",function(m){l&&(a.contains(m.target)||(clearTimeout(s),l=!1,d(!1)))})})})(),(function(){var e=document.querySelector(".pc-consent-details");if(!e)return;try{if(localStorage.getItem("lq-consent-seen")==="1")return}catch{return}function a(){try{localStorage.setItem("lq-consent-seen","1")}catch{}document.documentElement.classList.remove("consent-unseen"),e.removeEventListener("mouseenter",a),e.removeEventListener("click",a)}e.addEventListener("mouseenter",a),e.addEventListener("click",a)})(),document.addEventListener("load",function(e){e.target&&e.target.tagName==="IMG"&&e.target.classList.add("lq-img-ready")},!0),document.addEventListener("error",function(e){e.target&&e.target.tagName==="IMG"&&e.target.classList.add("lq-img-error")},!0),document.querySelectorAll("img").forEach(function(e){e.complete&&e.classList.add(e.naturalWidth>0?"lq-img-ready":"lq-img-error")});function lqEscapeHtml(e){return String(e).replace(/[&<>"']/g,function(a){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[a]})}window.buildTagBadgeHTML=function(e){var a=window.TAG_REGISTRY||{},o=a[String(e).toLowerCase().trim()]||{tier:"normal",wikiPageId:null,pct:0},c=o.tier==="normal"?' style="--pct:'+o.pct+'"':"",l=lqEscapeHtml(e);return o.wikiPageId&&(l+='<a class="tag-badge-arrow" href="/wiki/'+o.wikiPageId+'" title="Voir la page codex" aria-label="Voir la page codex" onclick="event.stopPropagation()">&#8599;</a>'),'<span class="tag-badge tag-badge--'+o.tier+'" data-tag="'+lqEscapeHtml(String(e).toLowerCase().trim())+'"'+c+">"+l+"</span>"},(function(){
var overlay=document.getElementById("tag-popup-overlay");
if(!overlay)return;
var title=document.getElementById("tag-popup-title");
var closeBtn=document.getElementById("tag-popup-close");
var wikiBtn=document.getElementById("tag-popup-wiki-btn");
var galerieBtn=document.getElementById("tag-popup-gallery-btn");
var bdBtn=document.getElementById("tag-popup-bd-btn");
var nouvellesBtn=document.getElementById("tag-popup-nouvelles-btn");
var current="";
function close(){overlay.hidden=true;current=""}
function open(raw){
current=String(raw).toLowerCase().trim();
if(!current)return;
title.textContent=raw;
[wikiBtn,galerieBtn,bdBtn,nouvellesBtn].forEach(function(b){b.hidden=true});
overlay.hidden=false;
fetch("/api/tags/results?tag="+encodeURIComponent(current)).then(function(r){return r.json()}).then(function(data){
if(current!==String(raw).toLowerCase().trim())return;
if(data.wiki&&data.wiki.length){wikiBtn.hidden=false;wikiBtn.textContent="Codex ("+data.wiki.length+")"}
if(data.galerie&&data.galerie.length){galerieBtn.hidden=false;galerieBtn.textContent="Images ("+data.galerie.length+")"}
if(data.bd&&data.bd.length){bdBtn.hidden=false;bdBtn.textContent="BD ("+data.bd.length+")"}
if(data.nouvelles&&data.nouvelles.length){nouvellesBtn.hidden=false;nouvellesBtn.textContent="Nouvelles ("+data.nouvelles.length+")"}
}).catch(function(){})
}
window.openTagPopup=open;
wikiBtn.addEventListener("click",function(){current&&(window.location.href="/wiki/tous?tag="+encodeURIComponent(current))});
galerieBtn.addEventListener("click",function(){current&&(window.location.href="/galerie?tag="+encodeURIComponent(current))});
bdBtn.addEventListener("click",function(){current&&(window.location.href="/bd?tag="+encodeURIComponent(current))});
nouvellesBtn.addEventListener("click",function(){current&&(window.location.href="/nouvelles?tag="+encodeURIComponent(current))});
closeBtn.addEventListener("click",close);
overlay.addEventListener("click",function(e){e.target===overlay&&close()});
document.addEventListener("keydown",function(e){e.key==="Escape"&&!overlay.hidden&&close()});
document.addEventListener("click",function(e){
var chip=e.target.closest(".tag-badge[data-tag]");
if(!chip)return;
e.preventDefault();
var tag=chip.dataset.tag;
if(localStorage.getItem("tag-click-mode")==="direct"){
var info=(window.TAG_REGISTRY||{})[tag]||{};
window.location.href=info.wikiPageId?"/wiki/"+info.wikiPageId:"/galerie?tag="+encodeURIComponent(tag);
return
}
open(tag)
})
})(),(function(){var e="lq-discreet",a=[document.getElementById("pc-discreet-btn"),document.getElementById("nav-mobile-discreet-btn")].filter(Boolean);if(!a.length)return;function o(){return document.documentElement.classList.contains("lq-discreet-mode")}function c(){var l=o();a.forEach(function(s){s.setAttribute("aria-pressed",l?"true":"false")})}c(),a.forEach(function(l){l.addEventListener("click",function(){var s=!o();document.documentElement.classList.toggle("lq-discreet-mode",s);try{localStorage.setItem(e,s?"1":"0")}catch{}c()})})})();
