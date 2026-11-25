// One item per project folder (first level of subfolders)
const root = $('Pick projects folder').first().json;
const folders = ($input.first().json.value || []).filter((x) => x.folder);
return folders.map((f) => ({
  json: { drive_id: root.drive_id, project_id: f.id, name: f.name, web_url: f.webUrl, last_modified: f.lastModifiedDateTime },
}));
