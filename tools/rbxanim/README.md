# rbxanim — Roblox-анимации (R6) → JSON → рендер на моделях Minecraft

Инструменты, которыми проверялся пак `rbxm11.7z` (762 `.rbxm`, из них 731 — R6 KeyframeSequence).

| Файл | Что делает |
|---|---|
| `rbxm.py` | читает бинарный `.rbxm` (`<roblox!`: чанки INST/PROP/PRNT, LZ4/ZSTD) и выгружает каждую KeyframeSequence в JSON: ключи, позы (CFrame, EasingStyle/Direction, Weight), маркеры (`Dmg`, `Swoosh`, …). `rbxm.py --batch <папка> <выход>` — весь пак + `index.json` |
| `catalog.py` | раскладывает анимации по категориям по имени (m1, dash, slam, block, hitreact, move, skill, pair, emote) |
| `render/r6.js` | поза R6 в момент t на модели игрока MC: изинги Roblox (Linear/Constant/Cubic/Elastic/Bounce/CubicV2, с «перевёрнутыми» In/Out у старых стилей), slerp, суставы Motor6D (C0/C1 стандартного R6) → пивоты модели игрока MC. Чистая функция времени |
| `render/scene.js`, `page.html` | сцена three.js: модель игрока MC (геометрия и UV ванильного скина 64×64, второй слой, slim-руки), трава, тени |
| `render/render.mjs` | покадровый рендер в headless Chromium (Playwright) → mp4 (ffmpeg) + лист кадров. Несколько камер в одном кадре (`side`, `shoulder`, `solo`, …) |
| `render/batch.sh`, `pairs.txt` | все пары «атакующий + жертва» |
| `render/catalog_batch.sh` | одиночные анимации из списка `catalog.py` |
| `render/analyze.mjs` | метрики качества: пиковые угловые скорости, поп-кадры, дрожь, развороты > 90° за кадр, проваливание в землю, «задержки» после ударов, маркеры |
| `render/fetch_tex.sh` | берёт скины Steve/Alex/… и траву из локального jar Minecraft (текстуры Mojang в git не кладём) |

Как пары стыкуются: у обоих ригов общий HumanoidRootPart (в игре Roblox жертву приваривают к атакующему), а взаимное
положение заложено в трек торса каждой анимации — смещать жертву вручную не нужно.

Масштаб: 1 стад = 0.4 блока для смещений торса (рост R6 5 стадов против 2 блоков у MC); по длине конечностей точнее
0.375 (нога R6 — 2 стада, у MC — 12 px), с ним стопы меньше проваливаются — переключим при переносе в мод.

```
python3 tools/rbxanim/rbxm.py --batch <распакованный пак> <json>
cd tools/rbxanim/render && npm install && ./fetch_tex.sh
node render.mjs --data <json> --out out/dropkick --cams side,shoulder --sheet 24 \
     --actor DropkickUser__179kf__3f74146dcad7d238fcddeb17c518187a --actor DropkickVictim__113kf__de84f178cc46a39a4b50102f22c39472
./batch.sh <json>                     # все пары из pairs.txt
node analyze.mjs <json> metrics.json  # метрики по всему паку
```
