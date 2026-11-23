/**
 * Source registry for Frontier Radar.
 * `featured` sources get a dedicated section in the UI.
 */
const SOURCES = [
  {
    id: 'claude',
    name: 'claude.dev',
    title: 'Claude 开发者博客',
    subtitle: 'Anthropic 官方开发者博客、构建日志与实践',
    homepage: 'https://claude.dev/',
    feedUrl: 'https://claude.dev/rss.xml',
    mark: 'CL',
    featured: true,
    group: '官方技术博客',
    description:
      'Anthropic 开发者团队关于 Claude 与 Claude Code 的工程实践、提示技巧、构建日志与观点。',
  },
  {
    id: 'openai',
    name: 'OpenAI News',
    title: 'OpenAI 动态',
    subtitle: '模型发布、产品更新与研究公告',
    homepage: 'https://openai.com/news/',
    feedUrl: 'https://openai.com/news/rss.xml',
    mark: 'OA',
    group: '官方技术博客',
  },
  {
    id: 'deepmind',
    name: 'Google DeepMind',
    title: 'DeepMind 博客',
    subtitle: '前沿 AI 研究与工程进展',
    homepage: 'https://deepmind.google/blog/',
    feedUrl: 'https://deepmind.google/blog/rss.xml',
    mark: 'DM',
    group: '官方技术博客',
  },
  {
    id: 'googleai',
    name: 'Google AI',
    title: 'Google AI 博客',
    subtitle: 'Google 的 AI 产品、研究与生态动态',
    homepage: 'https://blog.google/technology/ai/',
    feedUrl: 'https://blog.google/technology/ai/rss/',
    mark: 'GA',
    group: '官方技术博客',
  },
  {
    id: 'arxiv',
    name: 'arXiv cs.AI',
    title: 'arXiv AI 论文',
    subtitle: '每日人工智能预印本',
    homepage: 'https://arxiv.org/list/cs.AI/recent',
    feedUrl: 'https://rss.arxiv.org/rss/cs.AI',
    mark: 'AX',
    group: '研究前沿',
  },
  {
    id: 'hn',
    name: 'Hacker News',
    title: 'Hacker News 头条',
    subtitle: '工程师社区正在讨论什么',
    homepage: 'https://news.ycombinator.com/',
    feedUrl: 'https://hnrss.org/frontpage',
    mark: 'HN',
    group: '社区与媒体',
  },
  {
    id: 'mittr',
    name: 'MIT Tech Review',
    title: '麻省理工科技评论',
    subtitle: '技术趋势与深度报道',
    homepage: 'https://www.technologyreview.com/',
    feedUrl: 'https://www.technologyreview.com/feed/',
    mark: 'MT',
    group: '社区与媒体',
  },
  {
    id: 'verge',
    name: 'The Verge',
    title: 'The Verge',
    subtitle: '科技产业与产品新闻',
    homepage: 'https://www.theverge.com/',
    feedUrl: 'https://www.theverge.com/rss/index.xml',
    mark: 'VG',
    group: '社区与媒体',
  },
];

const SOURCE_MAP = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

function getSource(id) {
  return SOURCE_MAP[id] || null;
}

module.exports = { SOURCES, SOURCE_MAP, getSource };
