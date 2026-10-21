/** className 拼接(shadcn 惯例签名;冲突类由组件内部受控,不引 tailwind-merge) */
type ClassValue = string | false | null | undefined;

export function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}
