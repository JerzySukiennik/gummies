// Gummies: flavors, names and interface texts (Polish and English).
const q = new URLSearchParams(location.search).get('lang');
export const LANG = q === 'pl' || q === 'en' ? q : (navigator.language || 'pl').toLowerCase().startsWith('pl') ? 'pl' : 'en';

export const FLAVORS = [
  { id: 'strawberry', pl: 'Truskawka', en: 'Strawberry', adj: 'truskawkowe', hex: 0xe8192c, op: 0 },
  { id: 'raspberry', pl: 'Malina', en: 'Raspberry', adj: 'malinowe', hex: 0xd9165f, op: 0 },
  { id: 'cherry', pl: 'Wiśnia', en: 'Cherry', adj: 'wiśniowe', hex: 0xa30d2d, op: 0 },
  { id: 'orange', pl: 'Pomarańcza', en: 'Orange', adj: 'pomarańczowe', hex: 0xff7a00, op: 0 },
  { id: 'peach', pl: 'Brzoskwinia', en: 'Peach', adj: 'brzoskwiniowe', hex: 0xffa05c, op: 0 },
  { id: 'lemon', pl: 'Cytryna', en: 'Lemon', adj: 'cytrynowe', hex: 0xf7d117, op: 0 },
  { id: 'apple', pl: 'Jabłko', en: 'Apple', adj: 'jabłkowe', hex: 0x58c41c, op: 0 },
  { id: 'mint', pl: 'Mięta', en: 'Mint', adj: 'miętowe', hex: 0x1fcf9f, op: 0 },
  { id: 'blueberry', pl: 'Jagoda', en: 'Blueberry', adj: 'jagodowe', hex: 0x2f49e0, op: 0 },
  { id: 'grape', pl: 'Winogrono', en: 'Grape', adj: 'winogronowe', hex: 0x7a2cf0, op: 0 },
  { id: 'cola', pl: 'Cola', en: 'Cola', adj: 'colowe', hex: 0x6a3211, op: 0 },
  { id: 'cream', pl: 'Śmietanka', en: 'Cream', adj: 'śmietankowe', hex: 0xfff1dc, op: 0.9 },
  { id: 'bubblegum', pl: 'Guma balonowa', en: 'Bubblegum', adj: 'balonowe', hex: 0xff86c3, op: 0.8 },
  { id: 'yogurt', pl: 'Jogurt', en: 'Yogurt', adj: 'jogurtowe', hex: 0xbfe3ff, op: 0.85 },
];

export const PLURAL = {
  bear: ['misie', 'bears'],
  worm: ['robaki', 'worms'],
  cola: ['butelki coli', 'cola bottles'],
  ring: ['pierścienie', 'rings'],
  egg: ['jajka sadzone', 'fried eggs'],
  frog: ['żabki', 'frogs'],
  heart: ['serca', 'hearts'],
  star: ['gwiazdki', 'stars'],
  cherry: ['wiśnie', 'cherries'],
  drop: ['krople', 'drops'],
  flower: ['kwiatki', 'flowers'],
  strawberry: ['truskawki', 'strawberries'],
  rocket: ['rakiety', 'rockets'],
  duck: ['kaczki', 'ducks'],
  logo: ['wschody', 'sunrises'],
  fish: ['ryby', 'fish'],
  flame: ['płomienie', 'flames'],
  letterG: ['literki G', 'letter Gs'],
  dino: ['dinozaury', 'dinos'],
  cat: ['koty', 'cats'],
  shark: ['rekiny', 'sharks'],
  butterfly: ['motyle', 'butterflies'],
  snail: ['ślimaki', 'snails'],
  turtle: ['żółwie', 'turtles'],
  custom: ['żelki', 'gummies'],
  blob: ['kleksy', 'blobs'],
  mix: ['żelki', 'gummies'],
};

const TXT = {
  pl: {
    tagline: 'zrób własne żelki',
    start: 'Zacznij',
    collection: 'Kolekcja',
    molds: 'Formy',
    pickMold: 'Wybierz formę',
    custom: 'Własna',
    drawTitle: 'Narysuj swoją formę',
    drawHint: 'Jeden kształt albo kilka kresek. Zamknięta pętla się wypełni.',
    undo: 'Cofnij',
    clear: 'Wyczyść',
    done: 'Gotowe',
    mass: 'Masa',
    color: 'Kolor',
    flavor: 'Smak',
    shade: 'Jasność',
    fill: 'Nalej do dzbanka',
    chocolate: 'Czekolada',
    topping: 'Posypka',
    menu: 'Menu',
    clearTable: 'Wyczyść stół',
    sound: 'Dźwięk',
    on: 'wł.',
    off: 'wył.',
    fullscreen: 'Pełny ekran',
    closeBag: 'Zamknij paczkę',
    namePack: 'Nazwij paczkę',
    savePack: 'Zapisz paczkę',
    cancel: 'Anuluj',
    emptyCollection: 'Tu trafią Twoje paczki. Wrzuć żelki do torebki i ją zamknij.',
    del: 'Usuń',
    delAsk: 'Usunąć?',
    pieces: 'szt.',
    hintPour: 'Weź dzbanek i przytrzymaj nad formą, żeby lać',
    hintPourTouch: 'Dotknij dzbanka, a potem przytrzymaj palec nad formą',
    hintSet: 'Masa tężeje sama. Pociągnij żelka, żeby go wyjąć, albo pociągnij formę do góry',
    hintLoose: 'Stuknij żelka, żeby go obrócić. Polej czekoladą, posyp i wrzuć do torebki',
    hintEmpty: 'Dzbanek jest pusty',
    hintPutDown: 'Kliknij puste miejsce po narzędziu, żeby je odłożyć',
    hintPutDownTouch: 'Stuknij narzędzie, żeby je odłożyć',
    packSaved: 'Paczka zapisana w kolekcji',
    sour: 'Kwaśne',
    inChoc: 'w czekoladzie',
    withSprinkles: 'z posypką',
    mixName: 'Mieszanka żelków',
    newMold: 'Forma',
    pouch: 'Saszetka',
    look: 'Wygląd',
    pattern: 'Wzór',
    sticker: 'Naklejka',
    printName: 'Nazwa na nadruku',
    pourOut: 'Wysyp',
    reopen: 'Otwórz',
    toCollection: 'Do kolekcji',
    spill: 'Wysyp na stół',
    hintSeal: 'Weź zgrzewarkę i zaciśnij ją na górze saszetki',
    hintSealEmpty: 'Najpierw wrzuć żelki do saszetki',
    hintSealed: 'Zgrzane! Potrząśnij saszetką albo dodaj ją do kolekcji',
    hintPack: 'Przeciągnij żelka nad saszetkę i puść',
    back: 'Wróć',
    mine: 'Moje',
    everyone: 'Wszystkich',
    publish: 'Opublikuj',
    unpublish: 'Cofnij publikację',
    published: 'opublikowana',
    loading: 'Chwila…',
    more: 'Pokaż więcej',
    pubDone: 'Paczka jest w publicznej galerii',
    unpubDone: 'Paczka zniknęła z publicznej galerii',
    pubFail: 'Nie udało się połączyć z galerią',
    emptyPublic: 'Jeszcze nikt nic nie opublikował. Bądź pierwszy.',
    offline: 'Brak połączenia z galerią',
  },
  en: {
    tagline: 'make your own gummies',
    start: 'Start',
    collection: 'Collection',
    molds: 'Molds',
    pickMold: 'Pick a mold',
    custom: 'Custom',
    drawTitle: 'Draw your mold',
    drawHint: 'One shape or a few strokes. A closed loop gets filled.',
    undo: 'Undo',
    clear: 'Clear',
    done: 'Done',
    mass: 'Mass',
    color: 'Color',
    flavor: 'Flavor',
    shade: 'Brightness',
    fill: 'Fill the pitcher',
    chocolate: 'Chocolate',
    topping: 'Topping',
    menu: 'Menu',
    clearTable: 'Clear the table',
    sound: 'Sound',
    on: 'on',
    off: 'off',
    fullscreen: 'Fullscreen',
    closeBag: 'Seal the bag',
    namePack: 'Name your pack',
    savePack: 'Save pack',
    cancel: 'Cancel',
    emptyCollection: 'Your packs will live here. Drop gummies into the bag and seal it.',
    del: 'Delete',
    delAsk: 'Delete?',
    pieces: 'pcs',
    hintPour: 'Pick up the pitcher and hold over the mold to pour',
    hintPourTouch: 'Tap the pitcher, then hold your finger over the mold',
    hintSet: 'The mass sets on its own. Pull a gummy out, or pull the mold up',
    hintLoose: 'Tap a gummy to flip it. Add chocolate, sprinkle and drop it in the bag',
    hintEmpty: 'The pitcher is empty',
    hintPutDown: 'Click the empty spot of a tool to put it back',
    hintPutDownTouch: 'Tap the tool to put it back',
    packSaved: 'Pack saved to your collection',
    sour: 'Sour',
    inChoc: 'in chocolate',
    withSprinkles: 'with sprinkles',
    mixName: 'Gummy mix',
    newMold: 'Mold',
    pouch: 'Pouch',
    look: 'Design',
    pattern: 'Pattern',
    sticker: 'Sticker',
    printName: 'Name on the print',
    pourOut: 'Pour out',
    reopen: 'Open',
    toCollection: 'Add to collection',
    spill: 'Pour onto the table',
    hintSeal: 'Pick up the heat sealer and clamp it on the top of the pouch',
    hintSealEmpty: 'Drop some gummies into the pouch first',
    hintSealed: 'Sealed! Shake the pouch or add it to your collection',
    hintPack: 'Drag a gummy over the pouch and let go',
    back: 'Back',
    mine: 'Mine',
    everyone: 'Everyone',
    publish: 'Publish',
    unpublish: 'Unpublish',
    published: 'published',
    loading: 'One moment…',
    more: 'Show more',
    pubDone: 'Your pack is in the public gallery',
    unpubDone: 'Your pack left the public gallery',
    pubFail: 'Could not reach the gallery',
    emptyPublic: 'Nobody has published anything yet. Be the first.',
    offline: 'No connection to the gallery',
  },
};

export const t = k => TXT[LANG][k] || k;
export const nm = o => o[LANG] || o.en;

export function packName(items) {
  const shapes = {};
  const flavors = {};
  let sour = 0;
  let choc = 0;
  let spr = 0;
  for (const it of items) {
    shapes[it.shape] = (shapes[it.shape] || 0) + 1;
    if (it.flavor) flavors[it.flavor] = (flavors[it.flavor] || 0) + 1;
    if (it.sour) sour++;
    if (it.choc) choc++;
    if (it.sprinkles) spr++;
  }
  const top = o => Object.keys(o).sort((a, b) => o[b] - o[a]);
  const sh = top(shapes);
  const fl = top(flavors);
  const n = items.length;
  const single = sh.length === 1 || shapes[sh[0]] >= n * 0.7;
  const fla = fl.length && flavors[fl[0]] >= n * 0.6 ? FLAVORS.find(f => f.id === fl[0]) : null;
  const pi = LANG === 'pl' ? 0 : 1;
  const noun = single ? (PLURAL[sh[0]] || PLURAL.mix)[pi] : PLURAL.mix[pi];
  let s;
  if (LANG === 'pl') {
    if (!single && !fla && sour < n * 0.5) s = t('mixName');
    else s = `${sour >= n * 0.5 ? t('sour') + ' ' : ''}${noun}${fla ? ' ' + fla.adj : ''}`;
    if (choc >= n * 0.5) s += ' ' + t('inChoc');
    else if (spr >= n * 0.5) s += ' ' + t('withSprinkles');
  } else {
    if (!single && !fla && sour < n * 0.5) s = t('mixName');
    else s = `${sour >= n * 0.5 ? t('sour') + ' ' : ''}${fla ? fla.en.toLowerCase() + ' ' : ''}${noun}`;
    if (choc >= n * 0.5) s += ' ' + t('inChoc');
    else if (spr >= n * 0.5) s += ' ' + t('withSprinkles');
  }
  return s.charAt(0).toUpperCase() + s.slice(1);
}
