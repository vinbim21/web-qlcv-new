import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrandLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/vinhomes-bird.svg"
      alt="Vinhomes"
      width={48}
      height={48}
      priority
      unoptimized
      className={cn("object-contain", className)}
    />
  );
}
