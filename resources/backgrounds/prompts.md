# 기본 배경 생성 프롬프트

배경화면들은 내장 ImageGen으로 생성한 이미지를 WebP로 압축한 파일입니다. 팀 컬러 무드는 현재 팀 색상을 사용하는 CSS 배경입니다. 현재 기본 배경은 밝은 계열 11종, 어두운 계열 14종으로 총 25종입니다.

이미지는 밝은 배경을 `light/`, 어두운 배경을 `dark/`에 저장합니다.

새 배경을 만들거나 수정할 때 사용한 프롬프트도 이 파일에 배경별로 이어서 기록합니다. 별도의 프롬프트 파일로 나누지 않습니다.

무료 사진 검토: [Juni Purnomo — An Empty Stadium](https://www.pexels.com/photo/an-empty-stadium-14815970/), 원본 3280×1844. [Pexels 라이선스](https://www.pexels.com/license/)의 웹사이트 사용·수정 허용을 확인하고 내려받아 검토했으나, 지붕 격자와 관중석의 세부 요소가 많아 기본 배경 목록에서는 제외했습니다. 이 사진은 아래 생성 이미지에 사용하지 않았습니다.

## 야간 경기장

Create a finished background image asset for a football live broadcast overlay application. Exactly 16:9 landscape, intended 2560x1440 or highest available landscape resolution. Art direction: elegant very dark midnight navy football stadium at night, an almost empty pitch suggested along the lower edge in subtle desaturated teal, incredibly faint accurately drawn football pitch white lines visible only toward the lower corners, distant stadium architecture and soft floodlights confined to extreme left and right top corners. Photorealistic cinematic atmosphere with restrained fine grain. This image sits BEHIND dense lineup, score, chat and statistics panels: center 80 percent must stay extremely dark, smooth, quiet negative space with no focal object, no brightly lit grass, no central white circle, no bright light beams crossing the center. Absolute priorities: subtlety and legibility, premium football broadcast identity. Overall dominant colors #070F1C #0B1727, accents very dim teal #163A42. No people, players, ball, trophies, logos, text, numbers, borders, UI, watermarks. The output is only the background artwork, full bleed, not a mockup or a screenshot.

## 네이비·민트

Create a finished premium abstract navy and mint background image asset for a football broadcast overlay dashboard. Exactly 16:9 landscape, highest available resolution. No mockup, no text, only full bleed background artwork. Deep midnight navy #091321 is 90 percent of the image. Composition: very restrained sweeping translucent ribbons and architectural curves suggesting the movement of football, a few thin technical curved lines and tiny subtle pitch-like angle markings, all confined to outermost edges and lower left / upper right corners. Accent color is muted teal/mint #226D70 with occasional tiny pale mint edge glint. Broad layered matte geometric planes rather than shiny neon streaks. Strong disciplined graphic design, sophisticated and calm, dark enough to place bright white player names and match stats over. Middle 75 percent and top center must be smooth dark negative space. No stadium photography, no grass, no central object, no luminous center, no bright mint area, no glowing rings, no ball, no logos, no lettering, no numbers, no UI, no frames or watermarks. Gentle texture, restrained contrast. Visually distinct from a photo stadium while belonging to the same professional broadcast toolkit.

## 에메랄드 피치

Create one finished full-bleed 16:9 landscape background artwork asset for a football live broadcast dashboard, highest available landscape resolution. Theme: EMERALD PITCH. A premium editorial abstract football pitch at night, not a photo stadium. Deep almost-black forest green #071B17 base, faint emerald and desaturated sage illumination confined to left and right outer edges and bottom corners. A large precise partial football center-circle arc and pitch touchlines are barely visible as fine architectural linework toward the bottom, oblique aerial perspective, restrained matte grass texture and extremely subtle alternating field bands. Middle 75 percent and top center remain very dark, empty, low contrast, because scoreboards and player names will overlay this. Sophisticated sports broadcast graphics, quiet and atmospheric rather than flashy. No focal object, no balls, no players, no logos, no text, numbers, watermarks, UI, frames, badges or mockups. Avoid strong white markings, bright green luminous glow, centered circle, neon grids. Distinctly green-black, not blue or mint.

## 차콜 그래픽

Create a finished 16:9 landscape full bleed background image asset for a professional football broadcast dashboard, highest available landscape resolution. Theme: CHARCOAL GRAPHITE. A refined monochrome sports editorial composition of broad matte graphite architectural facets and very subtle curved embossed contours inspired by a football's panel seams, occupying only outer corners. Deep neutral charcoal black #111315, softly layered dark gray #24282C, tiny restrained silver highlights along a few edges at extreme corners. The surface has a delicate paper-like micrograin, premium and understated. Middle 80 percent and top center must be calm dark near-flat negative space for white football player names, score and stats. Keep overall contrast low and neutrally gray, no navy, no teal, no green, no colorful glows. No recognizable ball object, no stadium, no text, numbers, logos, badges, UI, watermarks, frame, player, trophy or mockup. Avoid busy carbon fiber grids, excessive sci-fi lines, glossy metallic shine. This is only background art, full canvas, not a page design.

## 버건디 라이트

Create a finished premium 16:9 full-bleed landscape background asset for a football broadcast overlay dashboard, highest available resolution. Theme: BURGUNDY LIGHT. A dark sports broadcast editorial background in almost-black wine #180C14 and midnight plum, with a few broad fluid fabric-like translucent burgundy sweeps along the lower left and extreme upper right. Dim warm coral light grazes only the very outer folds. A barely visible subtle stadium-architecture arc at the outer edge can suggest live football, but no recognizable central subject. Elegant matte texture, deliberate smooth gradients, understated rich maroon colors, no blue or green. The middle 80 percent and top middle must remain very dark and quiet for white score and player-name overlays; no bright ribbons across the central space. Distinct from geometric navy/mint and black graphite designs: warm, soft, flowing, atmospheric. No typography, logos, numbers, badges, football ball, players, trophy, watermarks, UI, frames or mockups. Only the background artwork.


## 추가 배경 참고 자료

- [Øyedrops — Eliteserien](https://www.oyedrops.studio/work/eliteserien): 열린 공간, 추상 조명, 색채를 활용하는 방향 참고.
- [Found — UEFA](https://www.found-studio.com/work/uefa/): 입체적인 빛과 소재, 방송 그래픽의 질감 방향 참고.
- [Interstate — Premier League](https://interstateteam.com/portfolio/the-premier-league): 방송 그래픽의 색채와 정보 가독성 방향 참고.

참고 사례의 로고·구도·고유 도형을 복제하지 않고 새 배경으로 생성했습니다. 아래는 내장 ImageGen에 실제 사용한 전체 프롬프트입니다.

## 낮 경기장

파일: `light/stadium-day.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Photorealistic empty football stadium in soft overcast daylight, pale blue-gray sky fills upper half, distant hazy silver seating confined to lower side edges, a softly focused sage pitch only along bottom edge. Airy, fresh, clearly DAYTIME and medium-light rather than midnight, soft diffuse illumination, no harsh sunshine, no central pitch markings. Atmospheric sports photography, broadly even cool misty central negative space.

## 아이보리 페이퍼

파일: `light/ivory-paper.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Warm ivory off-white cotton paper background with tactile fine grain and broad embossed football-pitch inspired arcs in the far bottom left and top right corners. Editorial sports magazine aesthetic, cream, oatmeal, tiny muted ochre edge accent, soft daylight relief shadows. Center is near-flat warm ivory. Clearly light and warm, no dark vignette.

## 스카이 글라스

파일: `light/sky-glass.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Airy pale sky-blue frosted glass architectural curves and translucent broad blue ribbons around far corners. Inspired by open Nordic sports studio spaces, original forms. Smooth pale powder-blue center, very subtle diffused sunlight, a few cyan edge highlights. Sophisticated softly lit 3D material, no neon, no sharp central glass objects, no deep dark gradient. Truly light blue.

## 세이지 스튜디오

파일: `light/sage-studio.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Light muted sage green architectural sports studio abstraction: broad matte curved planes, very faint cropped pitch-line relief in lower corners, soft cream daylight shadows along edges. Pale sage calm flat center, fresh botanical color without leaves or objects. Contemporary editorial minimalism, clearly light, not dark emerald. No strong linework or visible centered circle.

## 샌드 웨이브

파일: `light/sand-dunes.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Warm light sand beige abstract flowing broad fabric or sculpted dune-like bands restricted to bottom left and far right edges. Refined sports editorial background, cream center, subtle peach side illumination, matte plaster texture. Shallow layered relief, spacious and friendly, no actual desert scene, no landscape horizon. Truly light warm beige, no dark vignette.

## 라벤더 헤이즈

파일: `light/lavender-haze.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Light lavender and pearl original sports broadcast background, broad soft translucent fabric-like curves and milky lilac haze at outer edges, flat calm pastel lavender center, delicate rose edge light. Sophisticated open studio atmosphere, gentle grain, minimal low contrast shapes. No sparkles, no stars, no neon, no dark purple vignette, distinctly light.

## 실버 컨투어

파일: `light/silver-contour.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Light pearl silver sports studio background. Broad matte aluminum architectural folds and soft embossed concentric arcs cropped tightly at bottom left and upper right corners, brushed microtexture, diffuse white studio light. Large center flat pale cool gray. Contemporary tactile sports graphic design, no chrome glare, no centered orb, no dark vignette.

## 딥 오션

파일: `dark/deep-ocean.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Dark deep petrol-blue background with large smooth refractive water-like caustic arcs along far side edges only, luxurious submerged-glass spatial atmosphere, broad subdued teal reflections, center calm deep blue rather than black. Smooth elegant fluid optical texture, no literal underwater objects, no bubbles, no central bright caustics, not neon.

## 코퍼 블랙

파일: `dark/copper-black.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Dark espresso graphite sports editorial background with broad matte folded black metal planes, very fine warm brushed-copper edge lighting at lower left and upper right. Subtle tactile grain, central dark warm charcoal quiet and even. Original architectural geometry, restrained bronze highlights, no metallic ball or trophy, no flashy gold, no central object.

## 미드나이트 퍼플

파일: `dark/midnight-purple.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Dark aubergine and midnight violet sports broadcast background with soft monumental translucent curved planes cropped at outer corners. Muted violet and pink light grazing surfaces only at extreme edges, sophisticated studio spatial depth, calm dark plum center. Matte finish and soft atmospheric light, no neon streaks, no space stars, no central glow.

## 스틸 블루

파일: `dark/steel-blue.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Dark slate steel-blue architectural sports background, broad diagonal matte planes subtly suggesting motion, cropped stadium-roof rib geometry faint at far top side edges, cool blue-gray brushed finish with soft silver grazing light. Quiet even dark slate-blue center, restrained dimensionality. Not navy-mint, no glossy carbon fiber, no sharp light beams or central motif.

## 포레스트 미스트

파일: `dark/forest-mist.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Dark desaturated pine-green atmospheric football background, very subtle distant stadium architecture dissolving into soft woodland-green mist at bottom side edges, diffuse sage light from upper outer corners, no discernible trees or objects. Rich moss and pine palette, center smooth deep muted green, velvety fine grain, calm fog rather than bright pitch stripes. No neon, no bright center.

## 피치 코랄

파일: `light/peach-coral.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Light warm peach and pale coral editorial sports graphic, broad origami-like paper folds cropped at far corners, soft apricot side lighting, calm cream-peach center. Matte pastel print texture, confident clean geometry, no dark vignette.

## 아이스 민트

파일: `light/ice-mint.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Very light icy mint and white spacious abstract sports studio, translucent frosted acrylic sheets and cropped pitch-inspired arcs at far lower corners, diffuse soft daylight, flat pale mint center. Cool clean fine texture, no central object, no dark green.

## 블루프린트

파일: `light/blueprint-light.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Light powder-blue tactical architectural paper background. Extremely faint thin schematic pitch arcs and alignment ticks only at the outer corners, center blank pale blue paper. Clean restrained technical sports editorial aesthetic, no labels or letters, no full pitch diagram, no busy grid.

## 페이퍼 콜라주

파일: `light/paper-collage.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Light off-white sports editorial torn-paper collage, broad cream and pale cool gray layers with tiny muted cobalt and orange strips only at extreme corners. Handmade tactile fiber edges and shallow shadows, large blank warm white center, no printed marks, no photographs or text, sophisticated restrained composition.

## 레드 터널

파일: `dark/red-tunnel.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Dark anthracite football stadium tunnel atmosphere in abstract architecture, broad matte charcoal planes at side edges and low saturated burgundy-red linear lights converging outside central area. Center quiet near-black charcoal, cinematic red edge glow, no people, no tunnel exit bright in center, no logos.

## 앰버 플러드라이트

파일: `dark/amber-floodlight.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Dark warm brown-black stadium-at-night atmosphere with softly diffused amber floodlight bloom in extreme upper corners and distant dark terrace silhouettes only along bottom edges. Large calm deep brown-gray center, cinematic warm haze, no bright central light, no pitch stripes, no navy or violet.

## 잉크 웨이브

파일: `dark/ink-wave.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Dark indigo editorial sports background with broad fluid matte ink-like waves and smoky cobalt diffusion along far lower left and right edges, calm uniform deep ink-blue center. Rich subtle pigment texture, flowing quiet shapes, no luminous ribbons, no actual writing, no stars.

## 블랙 메쉬

파일: `dark/black-mesh.webp`

Create one finished 16:9 full-bleed landscape background artwork for a football live broadcast dashboard, highest available landscape resolution. Only background art, no UI, mockup, panels, words, numbers, logos, badges, watermarks, people, balls or trophies. A calm large central 75 percent and top center are essential to overlay dense match information. All distinctive details stay at outer edges and corners; low spatial frequency, refined restraint, no busy pattern. Do not copy any existing competition identity. Dark neutral black sports equipment material background, extremely fine knitted jersey mesh texture visible only along outer corners with broad soft charcoal folds, center near-flat smooth deep gray-black. Monochrome tactile fabric, subtle side lighting, no repeating high contrast grid, no logos, no actual garment silhouette.
