// 북마크 버튼(북마클릿) 코드. 순수 문자열 처리만 한다(설정 화면에서 쓴다).
// 손으로 쓴 JS 원문에서 자리표시(__APP__, __TOKEN__)만 JSON 문자열로 바꾼다.
// TS 함수의 toString()은 빌드가 코드를 바꿀 수 있어 쓰지 않는다.
// 줄을 이어 붙이므로 모든 문장 끝에 세미콜론을 쓰고, 한 줄 주석(//)은 쓰지 않는다.

export const BOOKMARKLET_SOURCE = String.raw`
(function(){
var APP=__APP__,TOKEN=__TOKEN__;
if(location.origin===APP){alert('Career Flow 화면에서는 쓸 수 없습니다. 공고 페이지에서 누르세요.');return;}
var T=function(e){return (e&&(e.innerText||e.textContent))||'';};
var M=document.querySelector('main,[role=main],article');
var root=(M&&T(M).trim().length>=300)?M:document.body;
var RE=/^(상세\s*(정보|내용)?\s*)?(더\s*보기|펼치기|펼쳐\s*보기|자세히\s*보기|더\s*읽기)\s*[+▼▽∨⌄˅›>]?$|^(show|see|read)\s+more$|^more$/i;
try{
var ds=root.querySelectorAll('details:not([open])');
for(var i=0;i<ds.length&&i<20;i++){ds[i].open=true;}
}catch(e){}
try{
var cs=root.querySelectorAll('button,[role=button],summary,a');
var picked=[];
for(var j=0;j<cs.length&&picked.length<10;j++){
var el=cs[j];
try{
if(el.tagName==='A'){var h=(el.getAttribute('href')||'').trim();if(h&&!/^(#|javascript:)/i.test(h)){continue;}}
var tx=(el.textContent||'').replace(/\s+/g,' ').trim();
if(tx.length>15||!RE.test(tx)){continue;}
if((el.type==='submit'&&el.form)||el.disabled||el.getAttribute('aria-expanded')==='true'){continue;}
if(!el.getClientRects().length||el.closest('header,nav,footer')){continue;}
picked.push(el);
}catch(e){}
}
for(var k=0;k<picked.length;k++){try{picked[k].click();}catch(e){}}
}catch(e){}
setTimeout(function(){
try{
var fix=function(v,n){v=String(v).replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,'�');if(n&&v.length>n){v=v.slice(0,n);if(/[\uD800-\uDBFF]$/.test(v)){v=v.slice(0,-1);}}return v;};
var parts=[T(root)];
try{
var fr=document.querySelectorAll('iframe');
for(var f=0;f<fr.length;f++){
try{var b=fr[f].contentDocument&&fr[f].contentDocument.body;if(b){parts.push(T(b));}}catch(e){}
}
}catch(e){}
var x=fix(parts.join('\n\n').trim());
if(!x){alert('이 페이지에서 글자를 찾지 못했습니다.');return;}
var cut=x.length>50000;
if(cut){x=fix(x,50000);}
var p={v:1,k:TOKEN,u:fix(location.href),t:fix(document.title.trim(),300),x:x,c:cut};
window.open(APP+'/postings/receive#cf='+encodeURIComponent(JSON.stringify(p)),'_blank','noopener,noreferrer');
}catch(err){alert('Career Flow로 보내지 못했습니다: '+(err&&err.message?err.message:err));}
},800);
})();
`;

/** 'javascript:' + 인코딩한 원문. 원문 속 %가 Chrome의 javascript: 주소 해석에 깨지지 않게 encodeURIComponent를 쓴다. */
export function buildBookmarkletCode({ token, appOrigin }: { token: string; appOrigin: string }): string {
  const source = BOOKMARKLET_SOURCE.replace(/\n\s*/g, '')
    .replace('__APP__', () => JSON.stringify(appOrigin))
    .replace('__TOKEN__', () => JSON.stringify(token));
  return 'javascript:' + encodeURIComponent(source);
}
