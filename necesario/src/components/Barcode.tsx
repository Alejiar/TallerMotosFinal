import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export default function Barcode({ value, height = 50 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (ref.current && value) {
      try {
        JsBarcode(ref.current, value, { format: "CODE128", height, displayValue: true, fontSize: 12, margin: 4 });
      } catch {
        // ignore
      }
    }
  }, [value, height]);
  return <svg ref={ref} />;
}
