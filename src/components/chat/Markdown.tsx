import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import { CodeBlock, InlineCode } from './CodeBlock';

import { cn } from '@/lib/utils';

interface Props {
  className?: string;
  children: string;
}

/**
 * 区分 inline code 与 fenced code block:
 * react-markdown 9 不再传 `inline` 字段,标准做法是看 className
 * 是否包含 `language-*`(由 remark/rehype 给 fenced code 加上)。
 */
const components: Components = {
  code({ className, children, ...props }) {
    if (className) {
      return <CodeBlock className={className}>{children}</CodeBlock>;
    }
    return (
      <InlineCode className={className} {...props}>
        {children}
      </InlineCode>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  a({ href, children }) {
    return (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

/** v1.3:plugin 数组提到模块作用域,避免每次 render 新建数组触发 react-markdown 重渲 */
const REMARK_PLUGINS = [remarkGfm, remarkMath];
const REHYPE_PLUGINS = [rehypeKatex];

/**
 * 统一 Markdown 渲染：GFM + Math + 自定义 code 块
 */
export function Markdown({ className, children }: Props) {
  return (
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-pre:m-0 prose-pre:bg-transparent prose-pre:p-0',
        'prose-code:before:content-none prose-code:after:content-none',
        'prose-p:leading-relaxed prose-li:leading-relaxed',
        'prose-headings:font-semibold prose-headings:tracking-tight',
        'prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
