'use strict';
const {Menu}=require('electron');
function installEditContextMenu(window){
 window.webContents.on('context-menu',(_event,params)=>{
  if(!params.isEditable)return;
  const flags=params.editFlags||{};
  const item=(label,role,enabled)=>({label,role,enabled:!!enabled});
  Menu.buildFromTemplate([item('撤销','undo',flags.canUndo),item('重做','redo',flags.canRedo),{type:'separator'},item('剪切','cut',flags.canCut),item('复制','copy',flags.canCopy),item('粘贴','paste',flags.canPaste),item('全选','selectAll',flags.canSelectAll)]).popup({window});
 });
}
module.exports={installEditContextMenu};
