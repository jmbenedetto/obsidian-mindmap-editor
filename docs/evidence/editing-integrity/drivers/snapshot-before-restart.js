const snapshot={purpose:'Agent fixture teardown snapshot, not a plugin recovery journal',recovery:app.mindmapEditorRecovery??[],maps:[],sources:[]};
for(const leaf of app.workspace.getLeavesOfType('mindmap-editor')){
 const map=leaf.view;
 map.containerEl.inert=true;
 const input=map.canvasEl.querySelector('.mindmap-edit-input');
 snapshot.maps.push({path:map.currentFile?.path,draft:map.activeDraft,input:input?{innerText:input.innerText,textContent:input.textContent}:null,disk:map.currentFile?await app.vault.adapter.read(map.currentFile.path):null});
}
for(const leaf of app.workspace.getLeavesOfType('markdown')){
 const view=leaf.view;
 view.containerEl.inert=true;
 snapshot.sources.push({state:leaf.getViewState(),buffer:typeof view.getViewData==='function'?view.getViewData():null,disk:view.file?await app.vault.adapter.read(view.file.path):null});
}
return snapshot;
