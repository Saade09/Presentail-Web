type Props = {
  size?: number | string;
};

export function DirhamSymbol({ size = "1em" }: Props) {
  return (
    <img
      src="/dirham-logo.png"
      alt=""
      aria-hidden="true"
      style={{
        height: typeof size === "number" ? `${size}px` : size,
        width: "auto",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    />
  );
}
