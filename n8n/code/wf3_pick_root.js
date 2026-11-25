// The shared folder was resolved; find the subfolder with the projects (or use the shared folder itself)
const s = $('Scan settings').first().json;
const item = $input.first().json;
const driveId = item.parentReference?.driveId;
const kids = item.children || [];
const sub = s.projects_subfolder
  ? kids.find((k) => k.folder && k.name.toLowerCase() === String(s.projects_subfolder).toLowerCase())
  : null;
if (!driveId) throw new Error('Could not resolve the shared folder. Is the OneDrive credential signed in with an account that can open the link?');
return [{ json: { drive_id: driveId, root_id: sub ? sub.id : item.id, root_name: sub ? sub.name : item.name, root_url: sub ? sub.webUrl : item.webUrl } }];
