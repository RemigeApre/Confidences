(function(){var h=document.getElementById("bd-grid"),c=h?Array.from(h.querySelectorAll(".bd-card")):[],g=document.getElementById("bd-count-hero"),f=document.getElementById("mobile-filter-sidebar"),n={search:"",types:{ultra:window.ULTRA_MODE==="hidden"?2:0,irrealiste:window.IRREALISTE_MODE==="hidden"?2:0},couleurOnly:!1,langue:"",parody:"",protagonistId:0,categories:[],tagIncluded:[],tagExcluded:[],minRating:0,notRated:!1,flame:!1,interested:!1},p=new Set((window.TAG_BLACKLIST||[]).map(function(e){return String(e).toLowerCase()})),u=document.getElementById("bd-couleur-toggle"),b=document.getElementById("bd-langue-filter");function y(){var e=document.getElementById("bd-tag-filter");e&&e.querySelectorAll(".wiki-tag-chip[data-tag]").forEach(function(t){p.has((t.dataset.tag||"").toLowerCase())&&(t.hidden=!0)})}document.addEventListener("tag-blacklist-change",function(){p=new Set((window.TAG_BLACKLIST||[]).map(function(e){return String(e).toLowerCase()})),y(),v()});function v(){var e=0;c.forEach(function(t){var r=(t.dataset.tags||"").split(",").filter(Boolean),i=t.dataset.title||"",a=t.dataset.ultra==="1",d=t.dataset.irrealiste==="1",l=t.dataset.langue||"",s=t.dataset.couleur==="1",L=Number(t.dataset.rating)||0,A=t.dataset.flame==="1",S=t.dataset.interested==="1",w=n.search.toLowerCase().trim(),o=!0;w&&i.indexOf(w)===-1&&(o=!1),o&&n.types.ultra===1&&!a&&(o=!1),o&&n.types.ultra===2&&a&&(o=!1),o&&n.types.irrealiste===1&&!d&&(o=!1),o&&n.types.irrealiste===2&&d&&(o=!1),o&&n.couleurOnly&&!s&&(o=!1),o&&n.langue&&l!==n.langue&&(o=!1),o&&n.tagIncluded.length&&!n.tagIncluded.every(function(m){return r.indexOf(m)!==-1})&&(o=!1),o&&n.tagExcluded.length&&n.tagExcluded.some(function(m){return r.indexOf(m)!==-1})&&(o=!1),o&&p.size&&r.some(function(m){return p.has(m)})&&(o=!1),o&&n.minRating>0&&L<n.minRating&&(o=!1),o&&n.notRated&&L!==0&&(o=!1),o&&n.flame&&!A&&(o=!1),o&&n.interested&&!S&&(o=!1);var E=t.dataset.parody||"";o&&n.parody&&E!==n.parody&&(o=!1);var P=(t.dataset.protagonists||"").split(",").map(Number).filter(Boolean);o&&n.protagonistId&&P.indexOf(n.protagonistId)===-1&&(o=!1);var C=(t.dataset.categories||"").split(",").filter(Boolean);o&&n.categories.length&&!n.categories.every(function(c){return C.indexOf(c)!==-1})&&(o=!1),t.style.display=o?"":"none",o&&e++}),g&&(g.textContent=e);(function(){var _vt=new Set();c.forEach(function(t){if(t.style.display!=="none"){(t.dataset.tags||"").split(",").filter(Boolean).forEach(function(tg){_vt.add(tg.toLowerCase());});}});var _tf=document.getElementById("bd-tag-filter");if(_tf){_tf.querySelectorAll(".wiki-tag-chip[data-tag]").forEach(function(chip){var _tag=(chip.dataset.tag||"").toLowerCase();var _s=Number(chip.dataset.state)||0;chip.classList.toggle("bd-tag-no-visible",_s===0&&!_vt.has(_tag)&&!p.has(_tag));});}})()}f&&(f.addEventListener("filterbase:change",function(e){n.search=e.detail.search||"",e.detail.types&&(n.types=e.detail.types),v()}),f.addEventListener("tagfilter:change",function(e){n.tagIncluded=e.detail.included||[],n.tagExcluded=e.detail.excluded||[],v()}),f.addEventListener("filterrating:change",function(e){n.minRating=e.detail.minRating||0,n.notRated=e.detail.notRated||!1,n.flame=e.detail.flame||!1,n.interested=e.detail.interested||!1,v()}),f.addEventListener("parodyfilter:change",function(e){n.parody=e.detail.active||"",v()}),f.addEventListener("protagonistfilter:change",function(e){n.protagonistId=e.detail.id||0,v()}),f.addEventListener("catfilter:change",function(e){n.categories=e.detail.cats||[],v()}),f.addEventListener("filterreset:reset",function(){n.couleurOnly=!1,n.langue="",n.parody="",n.protagonistId=0,n.categories=[],u&&u.classList.remove("active"),b&&b.querySelectorAll(".bd-langue-chip").forEach(function(e){e.classList.remove("active")}),f.querySelectorAll(".filter-block").forEach(function(e){typeof e._reset=="function"&&e._reset()}),v()}),f.addEventListener("filterreset:explore",function(){var e=c.filter(function(t){return t.style.display!=="none"});e.length&&e[Math.floor(Math.random()*e.length)].click()})),u&&u.addEventListener("click",function(){n.couleurOnly=!n.couleurOnly,u.classList.toggle("active",n.couleurOnly),v()}),b&&b.addEventListener("click",function(e){var t=e.target.closest(".bd-langue-chip");if(t){var r=t.dataset.langue;n.langue===r?(n.langue="",b.querySelectorAll(".bd-langue-chip").forEach(function(i){i.classList.remove("active")})):(n.langue=r,b.querySelectorAll(".bd-langue-chip").forEach(function(i){i.classList.remove("active")}),t.classList.add("active")),v()}}),y(),v()})(),(function(){
  var h=document.getElementById("bd-data-json");
  if(!h)return;
  var c={};
  try{JSON.parse(h.textContent).forEach(function(d){c[d.id]=d;})}catch(e){return;}
  var CAT_COLORS={inconnu:"#6b7280",groupe:"#7c3aed",monstre:"#b45309","pokémon":"#dc2626",animaux:"#16a34a",bdsm:"#db2777"};
  var LANG_FLAGS={francais:"https://flagcdn.com/20x15/fr.png",anglais:"https://flagcdn.com/20x15/gb.png",japonais:"https://flagcdn.com/20x15/jp.png"};
  var g=document.getElementById("bd-modal"),
      closeBtn=document.getElementById("bd-modal-close"),
      elBanner=document.getElementById("bd-modal-banner"),
      editBtn=document.getElementById("bd-modal-edit-btn"),
      imgEl=document.getElementById("bd-modal-cover"),
      titleEl=document.getElementById("bd-modal-title"),
      elMeta=document.getElementById("bd-modal-meta"),
      elCats=document.getElementById("bd-modal-cats"),
      elParody=document.getElementById("bd-modal-parody"),
      descEl=document.getElementById("bd-modal-desc"),
      tagsEl=document.getElementById("bd-modal-tags"),
      elProts=document.getElementById("bd-modal-prots"),
      elAuthor=document.getElementById("bd-modal-author"),
      elActions=document.getElementById("bd-modal-actions"),
      previewEl=document.getElementById("bd-modal-preview"),
      previewWrap=document.getElementById("bd-modal-preview-wrap"),
      readBtn=document.getElementById("bd-modal-read-btn");
  if(!g)return;

  function postJSON(url,body,cb){
    fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)})
      .then(function(r){return r.json();}).then(function(d){if(d.ok&&cb)cb(d);}).catch(function(){});
  }

  function openModal(d){
    if(d.imagePaths&&d.imagePaths[0]){imgEl.src=d.imagePaths[0];imgEl.style.display="";}else{imgEl.style.display="none";}
    titleEl.textContent=d.title;(function(){if(!elBanner)return;if(d.imagePaths&&d.imagePaths[0]){var ti=new Image();ti.crossOrigin="anonymous";ti.onload=function(){var cv=document.createElement("canvas");cv.width=16;cv.height=16;var cx=cv.getContext("2d");try{cx.drawImage(ti,0,0,16,16);var px=cx.getImageData(0,0,16,16).data,rr=0,gg=0,bb=0,nn=px.length/4;for(var ii=0;ii<px.length;ii+=4){rr+=px[ii];gg+=px[ii+1];bb+=px[ii+2];}elBanner.style.background="rgb("+(rr/nn*.4|0)+","+(gg/nn*.4|0)+","+(bb/nn*.4|0)+")";}catch(ex){elBanner.style.background="";}};ti.onerror=function(){elBanner.style.background="";};ti.src=d.imagePaths[0];}else{elBanner.style.background="";}if(editBtn){editBtn.hidden=!window.BD_IS_ADMIN;if(window.BD_IS_ADMIN)editBtn.href="/bd/"+d.id+"/edit";}})();
    if(elCats){elCats.innerHTML="";(d.categories||[]).forEach(function(cat){var chip=document.createElement("span");chip.className="bd-modal-cat";chip.textContent=cat.charAt(0).toUpperCase()+cat.slice(1);chip.style.setProperty("--cat-color",CAT_COLORS[cat]||"#888");elCats.appendChild(chip);});elCats.hidden=!(d.categories&&d.categories.length);}
    if(elParody){if(d.parody){elParody.hidden=false;elParody.innerHTML="";var sp=document.createElement("span");sp.className="bd-modal-parody-label";sp.textContent="Parodie ";elParody.appendChild(sp);var sv=document.createElement("span");sv.textContent=d.subParody?d.parody+" › "+d.subParody:d.parody;elParody.appendChild(sv);}else{elParody.hidden=true;}}
    if(elProts){var _prots=(d.protagonistIds||[]).map(function(id){return window.BD_PROTAGONISTS[id]||null;}).filter(Boolean);if(_prots.length){elProts.hidden=false;elProts.innerHTML="";_prots.forEach(function(nm){var chip=document.createElement("span");chip.className="bd-modal-prot-chip";chip.textContent=nm;elProts.appendChild(chip);});}else{elProts.hidden=true;}}
    tagsEl.innerHTML=(d.tags||[]).map(function(o){return window.buildTagBadgeHTML(o);}).join("");tagsEl.hidden=!(d.tags&&d.tags.length);
    if(elAuthor){if(d.author){elAuthor.hidden=false;elAuthor.innerHTML="";var _al=document.createElement("span");_al.className="bd-modal-meta-label";_al.textContent="Auteur ";elAuthor.appendChild(_al);var _av=document.createTextNode(d.author);elAuthor.appendChild(_av);}else{elAuthor.hidden=true;}}
    if(elMeta){elMeta.innerHTML="";if(d.langue&&LANG_FLAGS[d.langue]){var fi=document.createElement("img");fi.src=LANG_FLAGS[d.langue];fi.className="bd-flag-img";fi.alt=d.langue;elMeta.appendChild(fi);elMeta.hidden=false;}else if(d.langue==="autre"){var fg=document.createElement("span");fg.textContent="🌐";elMeta.appendChild(fg);elMeta.hidden=false;}else{elMeta.hidden=true;}}
    descEl.textContent=d.description||"";descEl.style.display=d.description?"":"none";
    if(elActions&&window.BD_IS_USER){elActions.style.display="";elActions.innerHTML="";var curRating=d.rating||0;var curFlame=!!d.flame;var curInterested=!!d.interested;var starsRow=document.createElement("div");starsRow.className="bd-modal-action-stars";for(var si=1;si<=5;si++){var star=document.createElement("button");star.type="button";star.className="bd-modal-star"+(si<=curRating?" filled":"");star.textContent="★";star.dataset.val=String(si);starsRow.appendChild(star);}starsRow.addEventListener("click",function(ev){var btn=ev.target.closest(".bd-modal-star");if(!btn)return;var val=Number(btn.dataset.val);var newR=curRating===val?0:val;postJSON("/bd/"+d.id+"/page/0/react",{rating:newR},function(res){curRating=res.rating;d.rating=res.rating;starsRow.querySelectorAll(".bd-modal-star").forEach(function(s,i){s.classList.toggle("filled",i<curRating);});});});elActions.appendChild(starsRow);var flameBtn=document.createElement("button");flameBtn.type="button";flameBtn.className="bd-modal-act-btn"+(curFlame?" active":"");flameBtn.title="J’adore";flameBtn.textContent="🔥";flameBtn.addEventListener("click",function(){postJSON("/bd/"+d.id+"/page/0/react",{flame:!curFlame},function(res){curFlame=res.flame;d.flame=res.flame;flameBtn.classList.toggle("active",curFlame);});});elActions.appendChild(flameBtn);var intBtn=document.createElement("button");intBtn.type="button";intBtn.className="bd-modal-act-btn"+(curInterested?" active":"");intBtn.title="À lire plus tard";intBtn.textContent="✨";intBtn.addEventListener("click",function(){postJSON("/bd/"+d.id+"/react",{interested:!curInterested},function(res){curInterested=res.interested;d.interested=res.interested;intBtn.classList.toggle("active",curInterested);});});elActions.appendChild(intBtn);var hideBtn=document.createElement("button");hideBtn.type="button";hideBtn.className="bd-modal-act-btn";hideBtn.title="Masquer";hideBtn.innerHTML="&#128065;";hideBtn.addEventListener("click",function(){postJSON("/bd/"+d.id+"/page/0/react",{hidden:true},function(){var card=document.querySelector('.bd-card[data-bd-id="'+d.id+'"');if(card)card.style.display="none";closeModal();});});elActions.appendChild(hideBtn);}else if(elActions){elActions.style.display="none";}
    previewEl.innerHTML="";
    var _chs=d.chapters&&d.chapters.length?d.chapters:[];
    if(_chs.length){
      _chs.forEach(function(ch,ci){var chEnd=_chs[ci+1]?_chs[ci+1].start:d.totalPages;var sec=document.createElement("div");sec.className="bd-modal-chapter-section";var lbl=document.createElement("p");lbl.className="bd-modal-chapter-label";lbl.textContent=ch.title||("Chapitre "+(ci+1));sec.appendChild(lbl);var row=document.createElement("div");row.className="bd-modal-chapter-thumbs";for(var pi=ch.start;pi<chEnd&&pi<d.imagePaths.length;pi++){(function(pageIdx){var o=d.imagePaths[pageIdx];if(!o)return;var m=document.createElement("button");m.type="button";m.className="bd-modal-thumb";m.title="Page "+(pageIdx+1);var img=document.createElement("img");img.src=o;img.alt="Page "+(pageIdx+1);img.loading="lazy";var num=document.createElement("span");num.className="bd-modal-thumb-num";num.textContent=pageIdx+1;m.appendChild(img);m.appendChild(num);m.addEventListener("click",function(){sessionStorage.setItem("bd_return_popup",String(d.id));localStorage.setItem("bd_progress_"+d.id,String(pageIdx));window.location.href="/bd/"+d.id+"?start="+pageIdx;});row.appendChild(m);})(pi);}sec.appendChild(row);previewEl.appendChild(sec);});
    }else{
      var sec=document.createElement("div");sec.className="bd-modal-chapter-section";var lbl=document.createElement("p");lbl.className="bd-modal-chapter-label";lbl.textContent="Chapitre 1";sec.appendChild(lbl);var row=document.createElement("div");row.className="bd-modal-chapter-thumbs";var _imgs=d.imagePaths.slice(0,10);_imgs.forEach(function(o,idx){var m=document.createElement("button");m.type="button";m.className="bd-modal-thumb";m.title="Page "+(idx+1);var img=document.createElement("img");img.src=o;img.alt="Page "+(idx+1);img.loading="lazy";var num=document.createElement("span");num.className="bd-modal-thumb-num";num.textContent=idx+1;m.appendChild(img);m.appendChild(num);m.addEventListener("click",function(){sessionStorage.setItem("bd_return_popup",String(d.id));localStorage.setItem("bd_progress_"+d.id,String(idx));window.location.href="/bd/"+d.id+"?start="+idx;});row.appendChild(m);});if(d.totalPages>10){var more=document.createElement("span");more.className="bd-modal-thumb-more";more.textContent="+"+(d.totalPages-10);row.appendChild(more);}sec.appendChild(row);previewEl.appendChild(sec);
    }
    previewWrap.style.display=d.totalPages>0?"":"none";
    if(readBtn){var _prog=parseInt(localStorage.getItem("bd_progress_"+d.id));if(!isNaN(_prog)&&_prog>0&&_prog<d.totalPages){readBtn.textContent="Continuer (p. "+(_prog+1)+")";readBtn.href="/bd/"+d.id+"?start="+_prog;}else{readBtn.textContent="Lire";var _ch0start=_chs.length?_chs[0].start:0;readBtn.href="/bd/"+d.id+(_ch0start>0?"?start="+_ch0start:"");}}
    curOpenId=d.id;g.hidden=false;document.body.style.overflow="hidden";
  }

  function closeModal(){g.hidden=true;document.body.style.overflow="";}

  var grid=document.getElementById("bd-grid");readBtn&&readBtn.addEventListener("click",function(){if(curOpenId)sessionStorage.setItem("bd_return_popup",String(curOpenId));});(function(){var pop=sessionStorage.getItem("bd_return_popup");if(!pop)return;sessionStorage.removeItem("bd_return_popup");setTimeout(function(){var bk=c[Number(pop)];if(bk&&g&&g.hidden)openModal(bk);},0);})();window.addEventListener("pageshow",function(ev){if(!ev.persisted)return;var pop=sessionStorage.getItem("bd_return_popup");if(!pop)return;sessionStorage.removeItem("bd_return_popup");var bk=c[Number(pop)];if(bk&&g&&g.hidden)openModal(bk);});
  grid&&grid.addEventListener("click",function(ev){var l=ev.target.closest(".bd-card[data-bd-id]");if(l){ev.preventDefault();var s=c[Number(l.dataset.bdId)];s&&openModal(s);}});
  closeBtn&&closeBtn.addEventListener("click",closeModal);
  g.addEventListener("click",function(ev){ev.target===g&&closeModal();});
  document.addEventListener("keydown",function(ev){ev.key==="Escape"&&!g.hidden&&closeModal();});
})(),(function(){"use strict";function h(e){for(var t=[4,28,48,140,175,210,270,330],r=0,i=e.toLowerCase(),a=0;a<i.length;a++)r=r*31+i.charCodeAt(a)|0;return t[Math.abs(r)%t.length]}document.querySelectorAll(".wiki-tags-widget").forEach(function(e){var t=e.querySelector(".wiki-tags-board"),r=e.querySelector(".wiki-tags-typing"),i=e.querySelector(".wiki-tags-hidden");if(!t||!r||!i)return;var a=i.value?i.value.split(",").map(function(l){return l.trim()}).filter(Boolean):[];function d(){t.querySelectorAll(".wiki-tag-pill-btn").forEach(function(l){l.remove()}),a.forEach(function(l){var s=document.createElement("span");s.className="link-tag-pill wiki-tag-pill-btn",s.style.background="hsl("+h(l)+", 55%, 42%)",s.style.color="#fff",s.style.cursor="pointer",s.textContent=l+" \xD7",s.addEventListener("click",function(){a=a.filter(function(L){return L!==l}),i.value=a.join(", "),d()}),t.insertBefore(s,r)}),i.value=a.join(", ")}r.addEventListener("keydown",function(l){if(l.key==="Enter"||l.key===","){l.preventDefault();var s=r.value.trim();s&&!a.includes(s)&&(a.push(s),d()),r.value=""}else l.key==="Backspace"&&!r.value&&a.length&&(a.pop(),i.value=a.join(", "),d())}),r.addEventListener("blur",function(){var l=r.value.trim();l&&!a.includes(l)&&(a.push(l),d()),r.value=""}),d()});})();
(function(){
  var wrap=document.getElementById("bdf-chapters-wrap");
  var addChBtn=document.getElementById("bdf-add-chapter");
  var orderEl=document.getElementById("bd-image-order");
  var chapEl=document.getElementById("bd-chapters-json");
  if(!wrap||!orderEl||!chapEl)return;

  function sync(){
    var allOrder=[];var chData=[];var gNewIdx=0;
    var items=wrap.querySelectorAll(".bdf-ch-item");
    var multi=items.length>1;
    items.forEach(function(item,ci){
      var chStart=allOrder.length;
      item.querySelectorAll(".bd-sort-item[data-src]").forEach(function(el){
        if(!el.classList.contains("bd-sort-item-removed"))allOrder.push(el.dataset.src);
      });
      var nf=item._newFiles||[];
      nf.forEach(function(_,fi){allOrder.push("__new__:"+(gNewIdx+fi));});
      gNewIdx+=nf.length;
      var titleEl=item.querySelector(".bdf-ch-title-inp");
      var title=titleEl?titleEl.value.trim():"";
      if(multi||(chStart>0||title)){chData.push({title:title||("Chapitre "+(ci+1)),start:chStart});}
    });
    orderEl.value=allOrder.join(",");
    chapEl.value=JSON.stringify(chData);
  }

  function makeSortable(grid){
    var dragged=null;
    grid.addEventListener("dragstart",function(e){dragged=e.target.closest(".bd-sort-item");dragged&&dragged.classList.add("bd-dragging");});
    grid.addEventListener("dragover",function(e){e.preventDefault();var t=e.target.closest(".bd-sort-item");if(!t||t===dragged)return;grid.querySelectorAll(".bd-sort-item").forEach(function(el){el.classList.remove("bd-drop-over");});t.classList.add("bd-drop-over");});
    grid.addEventListener("dragleave",function(e){var t=e.target.closest(".bd-sort-item");t&&t.classList.remove("bd-drop-over");});
    grid.addEventListener("drop",function(e){e.preventDefault();var t=e.target.closest(".bd-sort-item");if(!t||!dragged||t===dragged){grid.querySelectorAll(".bd-sort-item").forEach(function(el){el.classList.remove("bd-drop-over");});return;}grid.querySelectorAll(".bd-sort-item").forEach(function(el){el.classList.remove("bd-drop-over");});var items=Array.from(grid.querySelectorAll(".bd-sort-item"));var di=items.indexOf(dragged);var ti=items.indexOf(t);if(di<ti)grid.insertBefore(dragged,t.nextSibling);else grid.insertBefore(dragged,t);updateNums(grid);sync();});
    grid.addEventListener("dragend",function(){grid.querySelectorAll(".bd-sort-item").forEach(function(el){el.classList.remove("bd-dragging","bd-drop-over");});dragged=null;});
    grid.addEventListener("click",function(e){var btn=e.target.closest(".bd-sort-move-btn");if(!btn)return;var item=btn.closest(".bd-sort-item");if(!item)return;if(btn.classList.contains("bd-sort-move-up")){var prev=item.previousElementSibling;if(prev)grid.insertBefore(item,prev);}else{var next=item.nextElementSibling;if(next)grid.insertBefore(next,item);}updateNums(grid);sync();});
    grid.querySelectorAll(".bd-remove-cb").forEach(function(cb){cb.addEventListener("change",function(){var si=cb.closest(".bd-sort-item");si&&si.classList.toggle("bd-sort-item-removed",cb.checked);updateNums(grid);sync();});});
  }

  function updateNums(grid){var n=1;grid.querySelectorAll(".bd-sort-item").forEach(function(el){var sp=el.querySelector(".bd-sort-num");if(!sp)return;var removed=el.classList.contains("bd-sort-item-removed");sp.textContent=removed?"\u00d7":n++;});}

  function addPreview(item,files){
    var previews=item.querySelector(".bdf-ch-previews");
    if(!item._newFiles)item._newFiles=[];
    var prevCount=item._newFiles.length;
    Array.from(files).forEach(function(f,fi){
      item._newFiles.push(f);
      var div=document.createElement("div");div.className="bd-sort-item bd-preview-item";div.draggable=true;div.dataset.newIdx=String(prevCount+fi);
      var handle=document.createElement("div");handle.className="bd-sort-handle";handle.innerHTML="&#8597;";
      var img=document.createElement("img");img.src=URL.createObjectURL(f);img.alt="";img.className="bd-sort-img";
      var num=document.createElement("span");num.className="bd-sort-num";
      var rm=document.createElement("button");rm.type="button";rm.className="bd-preview-remove";rm.title="Retirer";rm.textContent="\u00d7";
      rm.addEventListener("click",function(){var idx=item._newFiles.indexOf(f);if(idx!==-1)item._newFiles.splice(idx,1);div.remove();updateNums(item.querySelector(".bd-sort-grid.bdf-ch-grid"));sync();});
      div.appendChild(handle);div.appendChild(img);div.appendChild(num);div.appendChild(rm);
      previews.appendChild(div);
    });
    updateNums(item.querySelector(".bd-sort-grid.bdf-ch-grid"));
    sync();
  }

  function initItem(item){
    var grid=item.querySelector(".bd-sort-grid.bdf-ch-grid");
    if(grid)makeSortable(grid);
    var fileInp=item.querySelector(".bdf-ch-file");
    if(fileInp){fileInp.addEventListener("change",function(){if(fileInp.files&&fileInp.files.length)addPreview(item,Array.from(fileInp.files).sort(function(a,b){return a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:"base"});}));fileInp.value="";});}
    var titleInp=item.querySelector(".bdf-ch-title-inp");
    if(titleInp)titleInp.addEventListener("input",sync);
    var rmBtn=item.querySelector(".bdf-ch-remove-btn");
    if(rmBtn){rmBtn.addEventListener("click",function(){item.remove();renumberChapters();sync();});}
  }

  function renumberChapters(){
    wrap.querySelectorAll(".bdf-ch-item").forEach(function(item,ci){
      var numEl=item.querySelector(".bdf-ch-num");if(numEl)numEl.textContent="Chapitre "+(ci+1);
      var rmBtn=item.querySelector(".bdf-ch-remove-btn");if(rmBtn)rmBtn.hidden=(ci===0);
    });
  }

  function createChapterItem(idx){
    var div=document.createElement("div");div.className="bdf-ch-item";div.dataset.chIdx=String(idx);
    div.innerHTML='<div class="bdf-ch-head"><span class="bdf-ch-num">Chapitre '+(idx+1)+'</span><input type="text" class="bdf-ch-title-inp" placeholder="Titre (optionnel)\u2026" maxlength="120" /><button type="button" class="bdf-ch-remove-btn" title="Supprimer ce chapitre">&times;</button></div><div class="bd-sort-grid bdf-ch-grid"></div><div class="bdf-ch-previews"></div><label class="wiki-image-add-label bdf-ch-add-label"><span>+ Pages</span><input type="file" name="images" accept="image/*" multiple class="bdf-ch-file" /></label>';
    return div;
  }

  // Init existing items
  wrap.querySelectorAll(".bdf-ch-item").forEach(function(item){initItem(item);});

  // Add chapter button
  if(addChBtn){addChBtn.addEventListener("click",function(){var items=wrap.querySelectorAll(".bdf-ch-item");var newItem=createChapterItem(items.length);wrap.appendChild(newItem);initItem(newItem);renumberChapters();sync();});}

  sync();
})();
(function(){var chips=document.getElementById("bdf-prot-chips"),inp=document.getElementById("bdf-prot-inp"),drop=document.getElementById("bdf-prot-drop"),hiddens=document.getElementById("bdf-prot-hiddens");if(!chips||!inp||!drop||!hiddens)return;var PROTS=window.BD_PROTAGONISTS||{};function syncHiddens(){hiddens.innerHTML="";Array.from(chips.querySelectorAll(".lbep-chip")).forEach(function(c){var id=c.dataset.protId;if(id){var h=document.createElement("input");h.type="hidden";h.name="protagonist_ids";h.value=id;hiddens.appendChild(h)}})}function addChip(id,name){var ids=Array.from(chips.querySelectorAll(".lbep-chip")).map(function(c){return c.dataset.protId});if(ids.indexOf(String(id))!==-1)return;var chip=document.createElement("span");chip.className="lbep-chip";chip.dataset.protId=id;var label=document.createElement("span");label.textContent=name;var btn=document.createElement("button");btn.type="button";btn.className="lbep-chip-x";btn.innerHTML="&times;";btn.addEventListener("click",function(){chip.remove();syncHiddens()});chip.appendChild(label);chip.appendChild(btn);chips.appendChild(chip);syncHiddens()}chips.querySelectorAll(".lbep-chip .lbep-chip-x").forEach(function(btn){btn.addEventListener("click",function(){btn.closest(".lbep-chip").remove();syncHiddens()})});syncHiddens();var timer;inp.addEventListener("input",function(){clearTimeout(timer);var q=inp.value.trim();if(!q){drop.innerHTML="";drop.hidden=true;return}timer=setTimeout(function(){var q2=q.toLowerCase();var matches=Object.keys(PROTS).filter(function(id){return PROTS[id].toLowerCase().indexOf(q2)!==-1}).slice(0,8);drop.innerHTML="";if(!matches.length){drop.hidden=true;return}matches.forEach(function(id){var li=document.createElement("li");li.className="lbep-ac-item";li.textContent=PROTS[id];li.addEventListener("mousedown",function(e){e.preventDefault();addChip(id,PROTS[id]);inp.value="";drop.innerHTML="";drop.hidden=true});drop.appendChild(li)});drop.hidden=false},180)});inp.addEventListener("blur",function(){setTimeout(function(){drop.innerHTML="";drop.hidden=true},160)})})();

(function(){var protFilter=document.getElementById("bd-prot-filter"),protSearch=document.getElementById("bd-prot-search"),sidebar=document.getElementById("mobile-filter-sidebar");if(!protFilter||!sidebar)return;var activeProt=0;protFilter.querySelectorAll(".bd-prot-chip").forEach(function(btn){btn.addEventListener("click",function(){var id=Number(btn.dataset.protId);if(activeProt===id){activeProt=0;btn.classList.remove("active")}else{protFilter.querySelectorAll(".bd-prot-chip").forEach(function(b){b.classList.remove("active")});btn.classList.add("active");activeProt=id}sidebar.dispatchEvent(new CustomEvent("protagonistfilter:change",{detail:{id:activeProt}}))})});sidebar.addEventListener("filterreset:reset",function(){activeProt=0;protFilter.querySelectorAll(".bd-prot-chip").forEach(function(b){b.classList.remove("active")})});if(protSearch){protSearch.addEventListener("input",function(){var q=protSearch.value.trim().toLowerCase();protFilter.querySelectorAll(".bd-prot-chip").forEach(function(btn){var label=(btn.querySelector(".wtc-label")||btn).textContent.toLowerCase();btn.hidden=q.length>0&&label.indexOf(q)===-1})})}})();(function(){var catFilter=document.getElementById("bd-cat-filter");var sidebar=document.getElementById("mobile-filter-sidebar");if(!catFilter||!sidebar)return;var activeCats=[];catFilter.querySelectorAll(".bd-cat-chip").forEach(function(btn){btn.addEventListener("click",function(){var cat=btn.dataset.cat;var idx=activeCats.indexOf(cat);if(idx===-1){activeCats.push(cat);btn.classList.add("active")}else{activeCats.splice(idx,1);btn.classList.remove("active")}sidebar.dispatchEvent(new CustomEvent("catfilter:change",{detail:{cats:activeCats.slice()}}))})});sidebar.addEventListener("filterreset:reset",function(){activeCats=[];catFilter.querySelectorAll(".bd-cat-chip").forEach(function(b){b.classList.remove("active")})})})();
