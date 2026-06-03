type Props = {
  size?: number | string;
  color?: string;
};

export function DirhamSymbol({ size = "1em", color = "currentColor" }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <path
        d="M28 18 L28 72 C28 82 36 88 48 88 L52 88 C68 88 78 78 78 60 C78 42 68 32 52 32 L40 32"
        stroke={color}
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 50 L88 50"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M14 64 L88 64"
        stroke={color}
        strokeWidth="7"
        strokeLinecap="round"
      />
    </svg>
  );
}
