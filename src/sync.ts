import path from 'path';
import sh from 'shelljs';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { config, manifest, currDir, cacheDir } from './config';
import copyMods from './copy';

const getFileDetails = async (modIdList: string[]): Promise<ISteamWorkshopItem[]> => {
  const form = new FormData();
  form.append('itemcount', modIdList.length.toString());
  modIdList.forEach((id, idx) => {
    form.append(`publishedfileids[${idx}]`, id);
  });

  const res: ISteamWorkshopItemResponse = await fetch('https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1', {
    method: 'POST',
    body: form
  }).then((res) => res.json());
  return res.response.publishedfiledetails;
};

const downloadUpdates = (modIdList: ISteamWorkshopItem[]) => {
  const commandPath = path.join(cacheDir, 'steamcommand');
  sh.ShellString(`// auto-generated by workshop-downloader
@ShutdownOnFailedCommand 0
@NoPromptForPassword 1
login ${config.username} ${config.password}
force_install_dir ${cacheDir}
`).to(commandPath);

  modIdList.forEach(({ publishedfileid }) => {
    sh.ShellString(`workshop_download_item ${config.appid} ${publishedfileid}\n`).toEnd(commandPath);
  });

  sh.ShellString('quit').toEnd(commandPath);

  sh.exec(`${config.steamCMD} +runscript ${commandPath}`);
};

const sync = async () => {
  const modIdList = Object.values(config.workshopItems);
  const steamItems = await getFileDetails(modIdList);

  const requireUpdates = steamItems.filter(({
    time_updated,
    publishedfileid,
  }) => time_updated * 1000 > manifest.lastRun || !manifest.modList.includes(publishedfileid));

  if (requireUpdates.length > 0) {
    requireUpdates.forEach(({ title }) => console.log(`${title} requires update.`));
    downloadUpdates(requireUpdates);
    copyMods();
  } else {
    console.log('Nothing to update...')
  }

  return steamItems;
};

sync().then((updatedMods) => {
  manifest.lastRun = (new Date()).valueOf();
  manifest.modList = updatedMods.map(({ publishedfileid }) => publishedfileid);
  sh.ShellString(JSON.stringify(manifest)).to(`${currDir}\\manifest`);
  console.log('Mod updates completed.');
});
