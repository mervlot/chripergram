const { execFile } = require('child_process');

const GAME_DEFINITIONS = [
  { name: 'Counter-Strike 2', processes: ['cs2'] },
  { name: 'Valorant', processes: ['valorant-win64-shipping', 'valorant'] },
  { name: 'Fortnite', processes: ['fortniteclient-win64-shipping'] },
  {
    name: 'Minecraft',
    processes: ['minecraft.windows'],
    titleIncludes: ['minecraft'],
    titleProcesses: ['java', 'javaw'],
  },
  { name: 'Grand Theft Auto V', processes: ['gta5'] },
  { name: 'Call of Duty', processes: ['cod', 'modernwarfare', 'blackopscoldwar'] },
  { name: 'Arma 3', processes: ['arma3_x64', 'arma3'] },
  { name: 'Apex Legends', processes: ['r5apex'] },
  { name: 'Dota 2', processes: ['dota2'] },
  { name: 'League of Legends', processes: ['league of legends'] },
  { name: 'Overwatch 2', processes: ['overwatch'] },
  { name: 'Rainbow Six Siege', processes: ['rainbowsix', 'rainbowsix_vulkan'] },
  { name: 'Rocket League', processes: ['rocketleague'] },
  { name: 'Roblox', processes: ['robloxplayerbeta'] },
  { name: 'Rust', processes: ['rustclient'] },
  { name: 'Escape from Tarkov', processes: ['escapefromtarkov'] },
  { name: 'Destiny 2', processes: ['destiny2'] },
  { name: 'Warframe', processes: ['warframe.x64', 'warframe'] },
  { name: 'War Thunder', processes: ['aces'] },
  { name: 'World of Tanks', processes: ['worldoftanks'] },
  { name: 'World of Warships', processes: ['worldofwarships'] },
  { name: 'Genshin Impact', processes: ['genshinimpact'] },
  { name: 'Honkai: Star Rail', processes: ['starrail'] },
  { name: 'Zenless Zone Zero', processes: ['zenlesszonezero'] },
  { name: 'Elden Ring', processes: ['eldenring'] },
  { name: "Baldur's Gate 3", processes: ['bg3', 'bg3_dx11'] },
  { name: 'Cyberpunk 2077', processes: ['cyberpunk2077'] },
  { name: 'The Witcher 3', processes: ['witcher3'] },
  { name: 'Helldivers 2', processes: ['helldivers2'] },
  { name: 'Palworld', processes: ['palworld-win64-shipping'] },
  { name: 'Dead by Daylight', processes: ['deadbydaylight-win64-shipping'] },
  { name: 'DayZ', processes: ['dayz_x64', 'dayz'] },
  { name: 'Sons of the Forest', processes: ['sonsoftheforest'] },
  { name: 'Phasmophobia', processes: ['phasmophobia'] },
  { name: 'Lethal Company', processes: ['lethal company'] },
  { name: 'Terraria', processes: ['terraria'] },
  { name: 'Stardew Valley', processes: ['stardew valley'] },
  { name: 'Among Us', processes: ['among us'] },
];

function normalizeProcessName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\.exe$/i, '');
}

function detectGame(processes) {
  const rows = Array.isArray(processes) ? processes : processes ? [processes] : [];
  const normalized = rows.map((process) => ({
    name: normalizeProcessName(process.ProcessName ?? process.name),
    title: String(process.MainWindowTitle ?? process.title ?? '').trim().toLowerCase(),
    path: String(process.Path ?? process.path ?? '').trim(),
  }));

  for (const game of GAME_DEFINITIONS) {
    if (
      normalized.some(
        (process) =>
          game.processes.includes(process.name) ||
          (game.titleProcesses?.includes(process.name) &&
            game.titleIncludes?.some((part) => process.title.includes(part))),
      )
    ) {
      return game.name;
    }
  }

  const ignoredSteamProcesses = new Set([
    'steam',
    'steamservice',
    'steamwebhelper',
    'gameoverlayui',
    'crashhandler',
    'crashhandler64',
    'easyanticheat',
    'easyanticheat_eos',
    'beservice',
    'battleye',
    'unins000',
  ]);
  for (const process of normalized) {
    if (!process.path || ignoredSteamProcesses.has(process.name)) continue;
    const match = process.path.match(/[\\/]steamapps[\\/]common[\\/]([^\\/]+)/i);
    if (match?.[1]) return match[1].trim().slice(0, 60);
  }
  return null;
}

function readWindowsProcesses() {
  const command =
    'Get-Process -ErrorAction SilentlyContinue | Select-Object ProcessName,Path,MainWindowTitle | ConvertTo-Json -Compress';
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 8000 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve([]);
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve([]);
        }
      },
    );
  });
}

async function scanRunningGame() {
  if (process.platform !== 'win32') return null;
  return detectGame(await readWindowsProcesses());
}

module.exports = { detectGame, scanRunningGame };
