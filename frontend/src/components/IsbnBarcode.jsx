const CODE39_PATTERNS = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn',
  '+': 'nwnnnwnwn',
  '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn',
};

function normalizeBarcodeValue(value) {
  return String(value || '')
    .trim()
    .normalize('NFKC')
    .toUpperCase()
    .replace(/\s+/g, ' ');
}

function toCode39Value(value) {
  const normalized = normalizeBarcodeValue(value);
  return [...normalized]
    .filter((character) => CODE39_PATTERNS[character])
    .join('');
}

function buildBars(value) {
  const encoded = `*${value}*`;
  const bars = [];
  let x = 0;

  for (const character of encoded) {
    const pattern = CODE39_PATTERNS[character];

    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === 'w' ? 3 : 1;
      if (index % 2 === 0) {
        bars.push({ x, width });
      }
      x += width;
    }

    x += 1;
  }

  return { bars, width: x };
}

export default function IsbnBarcode({ isbn, height = 72 }) {
  const value = toCode39Value(isbn);

  if (!value) {
    return (
      <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
        暂无可生成条形码的 ISBN
      </div>
    );
  }

  const quietZone = 10;
  const { bars, width } = buildBars(value);
  const viewBoxWidth = width + quietZone * 2;
  const textY = height + 18;

  return (
    <div className="w-full overflow-hidden rounded border border-gray-200 bg-white p-3">
      <svg
        role="img"
        aria-label={`ISBN barcode ${value}`}
        viewBox={`0 0 ${viewBoxWidth} ${height + 26}`}
        className="h-auto w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <rect width={viewBoxWidth} height={height + 26} fill="white" />
        {bars.map((bar, index) => (
          <rect
            key={`${bar.x}-${index}`}
            x={bar.x + quietZone}
            y="0"
            width={bar.width}
            height={height}
            fill="#111827"
          />
        ))}
        <text
          x={viewBoxWidth / 2}
          y={textY}
          textAnchor="middle"
          fontFamily="monospace"
          fontSize="10"
          fill="#374151"
        >
          {value}
        </text>
      </svg>
    </div>
  );
}
