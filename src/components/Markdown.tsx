import ReactMarkdown from "react-markdown";

interface Props {
  children: string;
  className?: string;
}

export function Markdown({ children, className = "" }: Props) {
  return (
    <div
      className={`prose-sm prose-invert max-w-none
        [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-slate-100 [&_h1]:mt-3 [&_h1]:mb-1.5
        [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-slate-100 [&_h2]:mt-2.5 [&_h2]:mb-1
        [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-slate-200 [&_h3]:mt-2 [&_h3]:mb-1
        [&_p]:text-xs [&_p]:text-slate-300 [&_p]:leading-relaxed [&_p]:my-1.5
        [&_ul]:text-xs [&_ul]:text-slate-300 [&_ul]:my-1 [&_ul]:pl-4 [&_ul]:list-disc
        [&_ol]:text-xs [&_ol]:text-slate-300 [&_ol]:my-1 [&_ol]:pl-4 [&_ol]:list-decimal
        [&_li]:my-0.5
        [&_code]:text-[11px] [&_code]:bg-slate-800 [&_code]:text-violet-300 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded
        [&_pre]:bg-slate-950 [&_pre]:rounded-md [&_pre]:p-2.5 [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:border [&_pre]:border-slate-700/50
        [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-emerald-300
        [&_a]:text-violet-400 [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-violet-300
        [&_strong]:text-slate-100 [&_strong]:font-semibold
        [&_em]:text-slate-300 [&_em]:italic
        [&_blockquote]:border-l-2 [&_blockquote]:border-slate-600 [&_blockquote]:pl-3 [&_blockquote]:my-2 [&_blockquote]:text-slate-400
        [&_hr]:border-slate-700 [&_hr]:my-3
        [&_table]:text-xs [&_table]:w-full [&_table]:my-2
        [&_th]:text-left [&_th]:text-slate-300 [&_th]:font-semibold [&_th]:pb-1 [&_th]:border-b [&_th]:border-slate-700 [&_th]:px-2
        [&_td]:text-slate-400 [&_td]:py-1 [&_td]:px-2 [&_td]:border-b [&_td]:border-slate-800
        ${className}
      `}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
