// Flaw / praise taxonomy shared by the AI prompt, the keyword rules and the opportunity brief fallback.
// Categories are fixed (so reports compare across products); issue keys are specific and can grow.

// Accent-safe whole-word alternation: \b breaks next to é/ü/ñ and only binds to the outer alternatives.
const ml = (re) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${re.source})(?![\\p{L}\\p{N}])`, 'u');

export const CATEGORIES = [
  {
    key: 'durability', label: 'Durability', severity: 4,
    fix: 'Stress-test the failure point (drop, cycle and fatigue tests) and upgrade that component or material.',
    claim: 'Built to last – tested for {n}+ cycles, backed by a {warranty} warranty.',
    issues: [
      { key: 'stopped-working', label: 'Stopped working after short use', patterns: [/\b(stopped|quit|ceased) (working|charging|turning on)/, /\b(died|dead) (after|within|in)\b/, /\bno longer (works|turns on)/, /\b(only|barely) lasted\b/, /\bworked (for|great for) (a|about|only|just)? ?(few|couple|\d+) (days|weeks|months)/, ml(/hört(e)? auf zu funktionieren|funktioniert nicht mehr|ne fonctionne plus|dejó de funcionar/)] },
      { key: 'broke-quickly', label: 'Breaks / cracks quickly', 
        fix: "Find the failure point (handle, base, hinge) with drop and fatigue tests and reinforce it.",
        claim: "Reinforced [part] – drop-tested from [X] m.", patterns: [/\b(broke|broken|breaks|snapped|cracked|cracks|shattered|fell apart|falling apart|came apart|split)\b/, ml(/kaputt|zerbrochen|gebrochen|cassé|roto|rompió/)] },
      { key: 'defective-on-arrival', label: 'Defective out of the box', patterns: [/\b(defective|faulty|doa|dead on arrival|didn'?t (work|turn on) (at all|out of the box|from the start)|never worked)\b/, ml(/defekt|défectueux|defectuoso/)] },
    ],
  },
  {
    key: 'quality', label: 'Build quality', severity: 3,
    fix: 'Upgrade the material / finish on the parts customers touch most and add a final QC check.',
    claim: 'Premium {material} construction – no flimsy plastic.',
    issues: [
      { key: 'cheap-materials', label: 'Feels cheap / flimsy', patterns: [/\b(cheap(ly)? made|feels cheap|flimsy|poor(ly)? (quality|made|built)|low quality|cheap plastic|thin plastic|toy[- ]like)\b/, ml(/billig|minderwertig|mauvaise qualité|mala calidad/)] },
      { key: 'finish-defects', label: 'Paint / coating chips or peels', 
        fix: "Switch to a harder powder coat / anodised finish and add a chip test (drop + abrasion) to QC.",
        claim: "Chip-resistant finish that still looks new after [X] drops.", patterns: [/\b(paint|coating|finish|color|colour) (chips?|chipped|chipping|peel(s|ed|ing)?|flak(es|ed|ing)|scratch(es|ed)? (easily|off))/, /\b(chips?|chipped|peeling|flaking) (paint|coating|off)\b/] },
      { key: 'inconsistent-quality', label: 'Inconsistent quality between units', patterns: [/\b(quality control|qc) (issue|problem|is (bad|poor|lacking))|\bhit or miss\b|\bsecond one (was|is) (also )?(bad|broken|defective)/] },
    ],
  },
  {
    key: 'leaks', label: 'Leaks & seals', severity: 4,
    fix: 'Redesign the seal (gasket material, thread depth) and leak-test every batch upside down.',
    claim: '100% leak-proof – tested upside down in a bag for 24 h.',
    issues: [
      { key: 'leaks', label: 'Leaks', 
        fix: "Redesign the seal (gasket material, thread depth) and leak-test every batch upside down.",
        claim: "100% leak-proof – tested upside down in a bag for 24 h.", patterns: [/\b(leak|leaks|leaked|leaking|leaky|drips?|dripping|seeps?|seeping)\b/, ml(/undicht|ausgelaufen|fuite|fuit|gotea|pierde agua/)] },
      { key: 'seal-gasket-fails', label: 'Seal / gasket fails or falls out', patterns: [/\b(seal|gasket|o-ring|rubber ring) (fell|falls|came|comes) (out|off)|\b(seal|gasket) (broke|failed|is loose|doesn'?t seal)\b/] },
    ],
  },
  {
    key: 'performance', label: 'Performance', severity: 3,
    fix: 'Raise the core spec customers measure (power, speed, output) and show the measured number in the listing.',
    claim: '{spec} more power than the leading alternatives – verified in side-by-side tests.',
    issues: [
      { key: 'weak-performance', label: 'Weak / underpowered', patterns: [/\b(underpowered|not (very )?powerful|no power|lacks power|barely (works|does anything)|doesn'?t (do|work) (well|much|properly)|poor performance|mediocre)\b/, /\b(suction|airflow|pressure|output|heat|cooling|motor|signal|grip|magnet|spray|flow) (is |was |feels )?(so |very |too |really )?(weak|poor|terrible|lacking)/] },
      { key: 'does-not-work', label: 'Does not do the job', patterns: [/\b(doesn'?t|does not|didn'?t|did not|won'?t) work\b/, /\b(useless|worthless|does nothing|did nothing|not working|not work)\b/, ml(/funktioniert nicht|ne marche pas|no funciona/)] },
      { key: 'slow', label: 'Slow / laggy', patterns: [/\b(slow|sluggish|laggy|lags|takes forever|takes too long)\b/] },
      { key: 'poor-temperature-retention', label: 'Does not keep hot/cold',
        fix: 'Improve the vacuum insulation (copper lining, better weld and lid seal) and lab-test hours of cold/hot retention.',
        claim: 'Ice-cold for [X] hours, hot for [Y] hours – lab-tested insulation.', patterns: [/\b(doesn'?t|does not|didn'?t|won'?t) (keep|stay|keeps?) (it |drinks? |water |coffee )?(cold|hot|warm|cool|ice)/, /\b(lukewarm|ice (melts?|melted|is gone) (by|within|in|after|quickly|fast|before)|melted (within|in) )/, /\bnot (insulated|keep(ing)? (cold|hot))/] },
      { key: 'inaccurate', label: 'Inaccurate readings / results', patterns: [/\b(inaccurate|not accurate|wrong (reading|readings|measurement)|off by|inconsistent readings|readings are (off|wrong))\b/] },
    ],
  },
  {
    key: 'battery', label: 'Battery & charging', severity: 3,
    fix: 'Fit a higher-capacity cell, validate the charging circuit and print real-use battery hours.',
    claim: '{hours} hours of real-use battery life – fast USB-C charging.',
    issues: [
      { key: 'short-battery-life', label: 'Short battery life', patterns: [/\bbattery (life )?(is )?(drains?|dies|died|terrible|awful|poor|short|weak|doesn'?t last|lasts? (only|barely))/, /\b(drains|dies) (fast|quickly)\b/, /\bwon'?t hold (a )?charge\b/, ml(/akku (hält nicht|ist schnell leer)|batterie (ne tient pas|faible)/)] },
      { key: 'charging-issues', label: 'Charging problems', patterns: [/\b(won'?t|doesn'?t|does not|stopped) charg(e|ing)\b/, /\bcharging (port|cable) (broke|stopped|is loose|loose)\b/, /\bcharger (broke|stopped|doesn'?t)/] },
    ],
  },
  {
    key: 'size_fit', label: 'Size & fit', severity: 2,
    fix: 'Publish an exact size chart with measurements and photos in hand / in use; adjust the sizing spec.',
    claim: 'True-to-size – exact measurements and a fit guide on every listing.',
    issues: [
      { key: 'too-small', label: 'Smaller than expected', patterns: [/\b(too small|runs small|smaller than (expected|pictured|described|i thought)|tiny|way smaller|size is (too )?small)\b/, ml(/zu klein|trop petit|demasiado pequeño/)] },
      { key: 'too-big', label: 'Bigger / bulkier than expected', patterns: [/\b(too big|too large|runs (big|large)|bigger than (expected|pictured|i thought)|bulky)\b/, ml(/zu groß|trop grand|demasiado grande/)] },
      { key: 'poor-fit', label: 'Does not fit', patterns: [/\b(doesn'?t|does not|didn'?t|won'?t) fit\b/, /\b(too tight|too loose|poor fit|bad fit|fit is (off|bad))\b/, ml(/passt nicht|ne rentre pas|no cabe|no queda/)] },
    ],
  },
  {
    key: 'usability', label: 'Ease of use & setup', severity: 2,
    fix: 'Simplify the first-use flow: quick-start card, QR video guide and fewer setup steps.',
    claim: 'Ready in {minutes} minutes – no tools, no app required.',
    issues: [
      { key: 'hard-to-use', label: 'Hard / awkward to use', patterns: [/\b(hard|difficult|awkward|confusing|frustrating|complicated|a pain) to (use|open|close|operate|figure out|control|press)\b/, /\bnot (user[- ]friendly|intuitive)\b/] },
      { key: 'difficult-setup', label: 'Difficult setup / assembly', patterns: [/\b(setup|set up|set-up|assembly|installation|install(ing)?) (is|was) (a nightmare|hard|difficult|confusing|a pain|complicated)/, /\b(hard|difficult|impossible) to (assemble|install|set up|setup)\b/] },
      { key: 'poor-instructions', label: 'Poor / missing instructions', patterns: [/\b(instructions?|manual|directions) (are |is |were |was )?(useless|terrible|poor|unclear|confusing|missing|not included|nonexistent|in chinese|bad)/, /\bno (instructions|manual|directions)\b/] },
      { key: 'hard-to-clean', label: 'Hard to clean', patterns: [/\b(hard|difficult|impossible|a pain) to clean\b/, /\b(mold|mould|mildew|gunk) (grows?|builds? up|inside|in the)/, /\bnot dishwasher safe\b/] },
    ],
  },
  {
    key: 'connectivity', label: 'App & connectivity', severity: 3,
    fix: 'Fix pairing stability (firmware + app), add offline mode and an in-app troubleshooting flow.',
    claim: 'Pairs in seconds and stays connected – no account needed.',
    issues: [
      { key: 'connection-drops', label: 'Disconnects / pairing fails', patterns: [/\b(disconnects?|keeps disconnecting|drops (the )?connection|connection drops|won'?t (pair|connect)|can'?t (pair|connect)|pairing (issues?|problems?)|loses? (connection|signal))\b/, /\b(bluetooth|wifi|wi-fi) (issues?|problems?|keeps|is (bad|terrible|unstable))/] },
      { key: 'bad-app', label: 'Buggy or required app', patterns: [/\bthe app (is|was) (terrible|awful|buggy|garbage|useless|bad)|\bapp (crashes|keeps crashing|doesn'?t work)|\brequires? (an|the) app\b/] },
    ],
  },
  {
    key: 'noise', label: 'Noise & vibration', severity: 2,
    fix: 'Add damping / better bearings and publish a measured dB value.',
    claim: 'Whisper-quiet at {db} dB.',
    issues: [
      { key: 'too-loud', label: 'Too loud / noisy', patterns: [/\b(too loud|very loud|so loud|extremely loud|noisy|loud noise|annoying noise|sounds like a (jet|lawn ?mower))\b/, ml(/zu laut|trop bruyant|muy ruidoso/)] },
      { key: 'rattles', label: 'Rattles / squeaks / buzzes', patterns: [/\b(rattl(es|ing|e)|squeak(s|y|ing)?|buzz(es|ing)|grinding|clicking noise|whine|whining)\b/] },
    ],
  },
  {
    key: 'material', label: 'Smell, taste & materials', severity: 3,
    fix: 'Switch to certified food-grade / low-VOC materials and state the certification on pack.',
    claim: 'BPA-free, certified food-grade materials – no smell, no aftertaste.',
    issues: [
      { key: 'bad-smell', label: 'Chemical / bad smell', 
        fix: "Switch to certified low-odour, food-grade materials and air-out before packing.",
        claim: "Odour-free, certified food-grade materials – nothing to air out.", patterns: [/\b(smell|smells|smelled|stinks|odor|odour|fumes)\b.{0,30}\b(chemical|plastic|bad|terrible|awful|strong|toxic|burning|weird)|\b(chemical|plastic|strong|burning|toxic) (smell|odor|odour)\b/, ml(/stinkt|geruch|odeur|olor/)] },
      { key: 'bad-taste', label: 'Metallic / plastic aftertaste', patterns: [/\b(metallic|metal|plastic|weird|funny|bad) (taste|aftertaste)|\btastes? (like )?(metal|plastic|weird|funny)\b/] },
      { key: 'irritation', label: 'Skin irritation / allergy', patterns: [/\b(rash|itch(y|ing)?|irritat(ed|ion|es)|allergic reaction|breakout|broke me out|burned my skin)\b/] },
    ],
  },
  {
    key: 'design', label: 'Design & ergonomics', severity: 2,
    fix: 'Rework the ergonomics customers mention (weight, grip, button placement) and show it in photos.',
    claim: 'Ergonomic design – {weight} lighter, comfortable for all-day use.',
    issues: [
      { key: 'heavy', label: 'Too heavy', 
        fix: "Cut weight (thinner wall gauge where safe, lighter lid) and state the exact weight.",
        claim: "Only [X] g – light enough to carry all day.", patterns: [/\b(too heavy|very heavy|heavier than (expected|i thought)|weighs a ton)\b/] },
      { key: 'uncomfortable', label: 'Uncomfortable', patterns: [/\b(uncomfortable|not comfortable|hurts (my|to)|painful to (wear|use|hold)|digs into)\b/, ml(/unbequem|inconfortable|incómodo/)] },
      { key: 'poor-design', label: 'Poor / impractical design', patterns: [/\b(poor(ly)? designed|bad design|design flaw|design is (bad|poor|terrible|flawed)|impractical|not practical|stupid design)\b/] },
      { key: 'lid-or-closure', label: 'Lid / closure / zipper problems', 
        fix: "Redesign the lid / closure hinge with a stronger material and run an open-close cycle test.",
        claim: "Lid tested for [X] open-close cycles – no snapping, no sticking.", patterns: [/\b(lid|cap|zipper|zip|clasp|latch|buckle|closure|button)s? (broke|breaks|is hard|won'?t (close|open|stay)|doesn'?t (close|stay)|pops? (off|open)|came off|fell off|stuck|jammed)\b/] },
    ],
  },
  {
    key: 'accuracy', label: 'Not as described', severity: 3,
    fix: 'Rewrite the listing so photos, size and specs match the real product; remove overstated claims.',
    claim: 'What you see is what you get – real photos, exact specs.',
    issues: [
      { key: 'not-as-described', label: 'Not as described / pictured', patterns: [/\b(not as (described|pictured|advertised|shown)|looks nothing like|different (than|from) (the )?(picture|photo|description|advertised)|misleading|false advertising|mis-?represented)\b/, ml(/nicht wie beschrieben|pas comme décrit|no es como se describe/)] },
      { key: 'wrong-color-or-model', label: 'Wrong colour / model received', patterns: [ml(/(wrong (color|colour|size|item|model|product))|received (a|the) (different|wrong)/)] },
      { key: 'fake-or-used', label: 'Counterfeit or used item', patterns: [/\b(counterfeit|fake|knock[- ]?off|not (genuine|authentic|original)|(was |is |arrived )(used|opened|returned|refurbished)|someone else'?s (hair|return)|previously used)\b/, ml(/fälschung|contrefaçon|falsificado/)] },
    ],
  },
  {
    key: 'packaging_shipping', label: 'Packaging & delivery', severity: 2,
    fix: 'Upgrade the inner packaging (drop-test the box) and add a parts checklist inside.',
    claim: 'Arrives protected and complete – drop-tested packaging.',
    issues: [
      { key: 'arrived-damaged', label: 'Arrived damaged', 
        fix: "Drop-test the retail box (ISTA 3A) and add inner protection around the weak point.",
        claim: "Ships in a drop-tested box – arrives flawless.", patterns: [/\b(arrived|came|delivered|showed up|received it) (damaged|broken|dented|cracked|scratched|smashed|crushed)\b/, /\b(dented|damaged) (on arrival|in shipping|box)\b/] },
      { key: 'missing-parts', label: 'Missing parts', patterns: [/\b(missing (parts?|pieces?|screws?|components?|accessories|the)|parts? (were |are )?missing|incomplete|didn'?t come with|did not come with|not included)\b/, ml(/fehlende teile|pièces manquantes|faltan piezas/)] },
      { key: 'poor-packaging', label: 'Poor packaging', patterns: [/\b(poor(ly)? packaged|bad packaging|packaging (was|is) (terrible|poor|bad|flimsy)|no packaging|just thrown in)\b/] },
    ],
  },
  {
    key: 'service', label: 'Seller & warranty', severity: 2,
    fix: 'Add a proactive warranty / replacement flow and answer every negative review within 24 h.',
    claim: 'Hassle-free {warranty} replacement guarantee – real people answer in 24 h.',
    issues: [
      { key: 'poor-support', label: 'Poor customer service / no reply', patterns: [/\b(customer service|seller|support|manufacturer|company) (is |was )?(terrible|awful|useless|horrible|non-?existent|unresponsive|rude|never (responded|replied|answered))/, /\b(no|never got a|never received a?) (response|reply|answer)\b/, ml(/kundenservice|service client|atención al cliente/)] },
      { key: 'warranty-refund-issues', label: 'Refund / warranty refused', patterns: [/\b(refused|denied|wouldn'?t|won'?t|will not) (to )?(refund|replace|honor|honour)|\bwarranty (is )?(useless|void|a joke|not honored)|\bcan'?t return\b|\bwindow (closed|passed)\b/] },
    ],
  },
  {
    key: 'value', label: 'Price & value', severity: 2,
    fix: 'Either justify the price (visible quality, bundle extras) or move to a better price/size point.',
    claim: 'More for your money: {bundle} included at the same price.',
    issues: [
      { key: 'overpriced', label: 'Overpriced / not worth it', patterns: [/\b(overpriced|over-priced|not worth (the|it|the money|the price)|waste of (money|cash)|rip[- ]?off|too expensive|way too much)\b/, ml(/geldverschwendung|pas la peine|no vale la pena|nicht wert/)] },
    ],
  },
  {
    key: 'safety', label: 'Safety', severity: 5,
    fix: 'Stop and investigate: thermal / electrical / sharp-edge safety test, certification (UL/CE), recall if needed.',
    claim: 'Safety-certified ({cert}) with built-in overheat protection.',
    issues: [
      { key: 'overheating', label: 'Overheats / melts / burns', patterns: [/\b(overheat(s|ed|ing)?|(?<!ice |ice cubes? )melt(ed|s|ing)|caught fire|on fire|smok(e|ed|ing)|sparks?|scorch(ed)?|burn(ed|t)? (out|up|my|me|hand|finger))\b/, /\bgets? (extremely|dangerously|too|very) hot\b/] },
      { key: 'safety-hazard', label: 'Safety hazard / injury', patterns: [/\b(dangerous|hazard(ous)?|unsafe|electric(al)? shock|shocked me|sharp edges?|cut (my|me)|injur(ed|y)|choking hazard|fire hazard)\b/, ml(/gefährlich|dangereux|peligroso/)] },
    ],
  },
  {
    key: 'compatibility', label: 'Compatibility', severity: 2,
    fix: 'Publish a clear compatibility list and test with the top devices / models buyers own.',
    claim: 'Works with {devices} – full compatibility list included.',
    issues: [
      { key: 'not-compatible', label: 'Not compatible', patterns: [/\b(not compatible|incompatible|doesn'?t work with|does not work with|won'?t work with|not work with my)\b/, ml(/nicht kompatibel|pas compatible|no es compatible/)] },
    ],
  },
];

export const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
export const ISSUE_INDEX = new Map(CATEGORIES.flatMap((c) => c.issues.map((i) => [i.key, { ...i, category: c.key }])));
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

// What customers love (used as "must keep / must match" in the brief).
export const PRAISE = [
  { key: 'great-quality', label: 'Solid build quality', category: 'quality', patterns: [/\b(well made|well built|great quality|high quality|good quality|sturdy|solid|durable|built like a tank|premium feel)\b/] },
  { key: 'works-great', label: 'Works great', category: 'performance', patterns: [/\b(works (great|perfectly|well|like a charm|as (advertised|described|expected))|does the job|does exactly what|performs (great|well))\b/] },
  { key: 'keeps-temperature', label: 'Keeps drinks hot/cold', category: 'performance', patterns: [/\b(keeps? (my )?(water|drinks?|coffee|it|ice)? ?(ice )?(cold|hot) (all day|for hours|overnight|\d+ hours)|ice (still|lasted))\b/] },
  { key: 'easy-to-use', label: 'Easy to use / set up', category: 'usability', patterns: [/\b(easy to (use|set ?up|install|assemble|clean|operate)|user[- ]friendly|intuitive|simple to use|super easy)\b/] },
  { key: 'great-value', label: 'Great value for money', category: 'value', patterns: [/\b(great (value|price|deal)|good value|worth (every penny|the money|it)|bang for (the|your) buck|affordable|best purchase)\b/] },
  { key: 'looks-great', label: 'Looks great / nice design', category: 'design', patterns: [/\b(looks (great|amazing|beautiful|nice|good|sleek)|beautiful|stylish|sleek|gorgeous|love the (color|colour|design|look))\b/] },
  { key: 'comfortable', label: 'Comfortable', category: 'design', patterns: [/\b(comfortable|comfy|fits (perfectly|great|well)|lightweight|light weight)\b/] },
  { key: 'long-battery', label: 'Long battery life', category: 'battery', patterns: [/\bbattery (life )?(is )?(great|amazing|excellent|lasts (forever|all day|for days))\b/] },
  { key: 'no-leaks', label: 'Does not leak', category: 'leaks', patterns: [/\b(no leaks?|doesn'?t leak|does not leak|leak[- ]proof|never leaked|zero leaks?)\b/] },
  { key: 'quiet', label: 'Quiet', category: 'noise', patterns: [/\b(very quiet|so quiet|super quiet|whisper quiet|barely hear it|silent)\b/] },
  { key: 'great-service', label: 'Helpful seller support', category: 'service', patterns: [ml(/(great|excellent|amazing|fantastic) (customer service|seller|support)|seller (replaced|refunded|was (great|helpful))/)] },
  { key: 'fast-delivery', label: 'Fast delivery, well packed', category: 'packaging_shipping', patterns: [/\b(arrived (quickly|fast|early|on time)|fast (shipping|delivery)|well packaged|packaged (well|nicely))\b/] },
];
export const PRAISE_INDEX = new Map(PRAISE.map((p) => [p.key, p]));

/** Free-text key from the AI -> stable kebab key; known synonyms map to taxonomy keys. */
const KEY_ALIASES = {
  'leaking': 'leaks', 'leak': 'leaks', 'leaky-lid': 'leaks', 'lid-leaks': 'leaks', 'leaks-from-lid': 'leaks', 'water-leaks': 'leaks',
  'broke': 'broke-quickly', 'breaks': 'broke-quickly', 'breaks-easily': 'broke-quickly', 'broken': 'broke-quickly', 'cracked': 'broke-quickly', 'cracks': 'broke-quickly', 'poor-durability': 'broke-quickly', 'not-durable': 'broke-quickly',
  'stops-working': 'stopped-working', 'stopped-working-quickly': 'stopped-working', 'died': 'stopped-working', 'short-lifespan': 'stopped-working',
  'defective': 'defective-on-arrival', 'doa': 'defective-on-arrival', 'arrived-defective': 'defective-on-arrival', 'dead-on-arrival': 'defective-on-arrival',
  'cheap': 'cheap-materials', 'flimsy': 'cheap-materials', 'cheaply-made': 'cheap-materials', 'poor-quality': 'cheap-materials', 'low-quality': 'cheap-materials', 'poor-build-quality': 'cheap-materials',
  'paint-chips': 'finish-defects', 'paint-chipping': 'finish-defects', 'coating-peels': 'finish-defects', 'peeling': 'finish-defects', 'chipping-paint': 'finish-defects',
  'doesnt-work': 'does-not-work', 'not-working': 'does-not-work', 'does-not-work-properly': 'does-not-work',
  'weak': 'weak-performance', 'underpowered': 'weak-performance', 'poor-performance': 'weak-performance',
  'battery-life': 'short-battery-life', 'battery-drains-fast': 'short-battery-life', 'poor-battery-life': 'short-battery-life', 'battery-dies-quickly': 'short-battery-life',
  'doesnt-keep-cold': 'poor-temperature-retention', 'does-not-keep-cold': 'poor-temperature-retention', 'poor-insulation': 'poor-temperature-retention', 'not-insulated': 'poor-temperature-retention', 'doesnt-keep-hot': 'poor-temperature-retention',
  'runs-small': 'too-small', 'smaller-than-expected': 'too-small', 'runs-large': 'too-big', 'bulky': 'too-big',
  'difficult-to-use': 'hard-to-use', 'confusing': 'hard-to-use', 'hard-to-assemble': 'difficult-setup', 'difficult-assembly': 'difficult-setup',
  'no-instructions': 'poor-instructions', 'bad-instructions': 'poor-instructions', 'difficult-to-clean': 'hard-to-clean', 'mold': 'hard-to-clean',
  'disconnects': 'connection-drops', 'bluetooth-issues': 'connection-drops', 'pairing-issues': 'connection-drops', 'connectivity-issues': 'connection-drops',
  'loud': 'too-loud', 'noisy': 'too-loud', 'chemical-smell': 'bad-smell', 'plastic-smell': 'bad-smell', 'smell': 'bad-smell',
  'metallic-taste': 'bad-taste', 'plastic-taste': 'bad-taste', 'aftertaste': 'bad-taste',
  'not-as-pictured': 'not-as-described', 'misleading-listing': 'not-as-described', 'misleading': 'not-as-described',
  'counterfeit': 'fake-or-used', 'used-item': 'fake-or-used', 'received-used': 'fake-or-used',
  'damaged-in-shipping': 'arrived-damaged', 'arrived-broken': 'arrived-damaged', 'dented-on-arrival': 'arrived-damaged',
  'missing-pieces': 'missing-parts', 'bad-customer-service': 'poor-support', 'poor-customer-service': 'poor-support', 'no-response-from-seller': 'poor-support',
  'not-worth-the-money': 'overpriced', 'too-expensive': 'overpriced', 'expensive': 'overpriced',
  'overheats': 'overheating', 'gets-hot': 'overheating', 'melted': 'overheating', 'incompatible': 'not-compatible',
  'lid-broke': 'lid-or-closure', 'zipper-broke': 'lid-or-closure', 'lid-issues': 'lid-or-closure', 'zipper-breaks': 'lid-or-closure', 'lid-hard-to-open': 'lid-or-closure',
};

export function canonicalKey(k) {
  let s = String(k || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  if (!s) return null;
  if (KEY_ALIASES[s]) return KEY_ALIASES[s];
  const singular = s.replace(/(?<!s)s$/, '');
  if (KEY_ALIASES[singular]) return KEY_ALIASES[singular];
  return s;
}

export function issueLabel(key) {
  return ISSUE_INDEX.get(key)?.label || PRAISE_INDEX.get(key)?.label || key.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
