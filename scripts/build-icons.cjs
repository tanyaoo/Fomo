'use strict';
// Bootstrap Icons 1.13.1 (MIT). Keep the distributed SVGs unchanged.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const names = {notes:'grid',link:'link-45deg',sparkles:'stars',calendar:'calendar3',shuffle:'shuffle',star:'star',search:'search',settings:'gear',plus:'plus-lg',trash:'trash3',help:'question-circle',refresh:'arrow-repeat',sliders:'filter',list:'list-ul',ordered:'list-ol',quote:'quote',image:'image',send:'send-fill',down:'chevron-down',close:'x-lg',edit:'pencil-square',copy:'copy',menu:'list',check:'check-lg',home:'house-door',voice:'soundwave',chat:'chat-dots-fill',insight:'bullseye',walk:'footprints',pin:'pin-angle',hash:'hash',type:'type',mention:'at',download:'download',clock:'clock-history'};
// Bootstrap has no footprints glyph; use its walking-person icon.
names.walk='person-walking';
names.notes='grid-fill';
names.insight='record-circle';
names.chat='chat-left-dots-fill';
Object.assign(names,{share:'box-arrow-up',window:'window-sidebar',float:'pin-angle',history:'clock-history',more:'three-dots',external:'arrow-up-right-circle-fill',backlink:'arrow-down-right-circle-fill',linkedMemo:'arrow-up-left-circle-fill',backlinkedMemo:'arrow-down-right-circle-fill',back:'chevron-left',next:'chevron-right'});
names.menuEdit='pencil';names.keyboard='keyboard';
const icons = Object.fromEntries(Object.entries(names).map(([key,name]) => [key, fs.readFileSync(path.join(root,'node_modules/bootstrap-icons/icons',name+'.svg'),'utf8').replace('<svg ','<svg aria-hidden="true" ')]));
// Unmodified Lucide 1.8.0 icon nodes, ISC license in vendor/lucide/LICENSE.
const footprints=JSON.parse(fs.readFileSync(path.join(root,'vendor/lucide/footprints.json'),'utf8'));
icons.walk='<svg class="lucide-footprints" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+footprints.map(([tag,attrs])=>'<'+tag+' '+Object.entries(attrs).map(([key,value])=>key+'="'+value+'"').join(' ')+'/>').join('')+'</svg>';
// Original sidebar glyphs share a 16px canvas and filled visual weight.
const filled=body=>'<svg class="sidebar-glyph" aria-hidden="true" viewBox="0 0 16 16" fill="currentColor">'+body+'</svg>';
Object.assign(icons,{
 sidebarTrash:'<svg class="sidebar-trash-glyph" aria-hidden="true" width="14" height="15" viewBox="0 0 14 15" fill="currentColor"><path fill-rule="evenodd" clip-rule="evenodd" d="M4.4 1h5.2V0H4.4v1ZM.8 2.2h12.4v1.4H.8V2.2Zm1.1 2.1h10.2l-.65 8.95a1.35 1.35 0 0 1-1.35 1.25H4a1.35 1.35 0 0 1-1.35-1.25L1.9 4.3Zm2.2 1.25a.47.47 0 0 1 .5-.43c.25.01.44.23.43.48l-.16 6.25a.47.47 0 0 1-.5.46.47.47 0 0 1-.43-.48l.16-6.28Zm3.3-.43c.26-.02.49.18.5.43l.16 6.28a.47.47 0 0 1-.43.48.47.47 0 0 1-.5-.46l-.16-6.25a.47.47 0 0 1 .43-.48Zm3.1.43c.26-.02.49.18.5.43l.16 6.28a.47.47 0 0 1-.43.48.47.47 0 0 1-.5-.46l-.16-6.25a.47.47 0 0 1 .43-.48Z"/></svg>',
 sidebarCollapse:"<svg class=\"sidebar-glyph\" aria-hidden=\"true\" viewBox=\"0 0 12 12\" fill=\"currentColor\"><path d=\"M8.48532 5.6038C8.74532 5.80395 8.74532 6.19605 8.48532 6.3962L4.18 9.71044C3.85121 9.96354 3.375 9.72916 3.375 9.31424L3.375 2.68576C3.375 2.27084 3.85121 2.03646 4.18 2.28956L8.48532 5.6038Z\"/></svg>",
 sidebarNoTag:'<svg class="sidebar-glyph" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 1.5 9.5V2h7.5l5.5 5.5-4 4M6 14l8-12"/><circle cx="5" cy="5.5" r=".7" fill="currentColor" stroke="none"/></svg>',
 sidebarVoice:'<svg class="sidebar-glyph" aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 6a3 3 0 0 1 0 4m3-6a6 6 0 0 1 0 8m3-10a9 9 0 0 1 0 12"/></svg>',
 sidebarNotes:filled('<rect x="1" y="1" width="6" height="6" rx="1.3"/><rect x="9" y="1" width="6" height="6" rx="1.3"/><rect x="1" y="9" width="6" height="6" rx="1.3"/><rect x="9" y="9" width="6" height="6" rx="1.3"/>'),
 sidebarReview:filled('<path d="m7 3 1.2 4L12 8.5l-3.8 1.4L7 14l-1.2-4.1L2 8.5 5.8 7Zm5-2 .7 2.2L15 4l-2.3.8L12 7l-.7-2.2L9 4l2.3-.8ZM2 0l.6 1.6L4 2l-1.4.5L2 4 .5 2.5 0 2l1.4-.4Z"/>'),
 sidebarInsight:filled('<path fill-rule="evenodd" d="M8 .7a7.3 7.3 0 1 0 0 14.6A7.3 7.3 0 0 0 8 .7m0 2.3a5 5 0 1 1 0 10A5 5 0 0 1 8 3"/><circle cx="8" cy="8" r="2"/>'),
 sidebarWalk:filled('<ellipse cx="4.2" cy="4.7" rx="2.3" ry="3.6" transform="rotate(-12 4.2 4.7)"/><path d="M3.3 9.2h2.4l.5 2.1a1.5 1.5 0 0 1-3 .5Z"/><ellipse cx="11.5" cy="8" rx="2.3" ry="3.6" transform="rotate(12 11.5 8)"/><path d="M10.1 12.2h2.4l-.2 2.5a1.5 1.5 0 0 1-3-.5Z"/>'),
 sidebarHash:"<svg class=\"sidebar-glyph\" aria-hidden=\"true\" viewBox=\"0 0 18 18\" fill=\"currentColor\"><path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M6.153 7.5L5.838 10.5H3V12H5.6805L5.28675 15.75H6.795L7.18875 12H10.1805L9.78675 15.75H11.295L11.6888 12H15V10.5H11.847L12.162 7.5H15V6H12.3195L12.7133 2.25H11.205L10.8113 6H7.8195L8.21325 2.25H6.705L6.31125 6H3V7.5H6.153ZM10.3387 10.5H7.34625L7.66125 7.5H10.6537L10.3387 10.5Z\"/></svg>", ellipsis:"<svg class=\"sidebar-glyph\" aria-hidden=\"true\" viewBox=\"0 0 16 16\" fill=\"currentColor\"><circle cx=\"3\" cy=\"8\" r=\"0.8\"/><circle cx=\"8\" cy=\"8\" r=\"0.8\"/><circle cx=\"13\" cy=\"8\" r=\"0.8\"/></svg>",
 sort:filled('<path d="M3 1h1.5v11l1.8-1.8 1 1L3.7 15 0 11.2l1-1L3 12Zm5 2h8v1.5H8Zm0 4h6v1.5H8Zm0 4h4v1.5H8Z"/>')
});
const toolbarIcons=JSON.parse(fs.readFileSync(path.join(root,'scripts/toolbar-icons.json'),'utf8'));
Object.assign(icons,toolbarIcons);
fs.writeFileSync(path.join(root,'dist/icons.js'), '// Bootstrap Icons 1.13.1 — MIT; see THIRD-PARTY-NOTICES.md. Original sidebar glyphs.\nwindow.memoIcons='+JSON.stringify(icons)+';\n');
