# フロントエンドパターン

> React / Next.js 開発のベストプラクティス（Next.js + TypeScript プロジェクト向け）

> **注意**: このスキルは Next.js + TypeScript + Supabase プロジェクト向けです。
> 別の技術スタックを使用する場合は、プロジェクトに合わせてカスタマイズしてください。

---

## コンポーネント設計

### コンポジション優先

```tsx
// ✅ 良い例: 小さなコンポーネントを組み合わせる
const Card = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-lg border p-4 shadow-sm">{children}</div>
);

const CardHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="border-b pb-2 mb-4">{children}</div>
);

const CardBody = ({ children }: { children: React.ReactNode }) => (
  <div>{children}</div>
);

// 使用例
<Card>
  <CardHeader>タイトル</CardHeader>
  <CardBody>コンテンツ</CardBody>
</Card>

// ❌ 悪い例: 1つの巨大コンポーネントに全部詰め込む
const Card = ({ title, content, footer, showBorder, ...manyMoreProps }) => (
  // 100行以上のJSX
);
```

### Compound Components

関連するコンポーネントをまとめて提供。

```tsx
interface TabsContextType {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

const Tabs = ({ children, defaultTab }: { children: React.ReactNode; defaultTab: string }) => {
  const [activeTab, setActiveTab] = useState(defaultTab);

  return (
    <TabsContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="tabs">{children}</div>
    </TabsContext.Provider>
  );
};

const TabList = ({ children }: { children: React.ReactNode }) => (
  <div className="tab-list" role="tablist">{children}</div>
);

const Tab = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tab must be used within Tabs');

  return (
    <button
      role="tab"
      aria-selected={context.activeTab === id}
      onClick={() => context.setActiveTab(id)}
    >
      {children}
    </button>
  );
};

const TabPanel = ({ id, children }: { id: string; children: React.ReactNode }) => {
  const context = useContext(TabsContext);
  if (!context) throw new Error('TabPanel must be used within Tabs');
  if (context.activeTab !== id) return null;

  return <div role="tabpanel">{children}</div>;
};

// 使用例
<Tabs defaultTab="tab1">
  <TabList>
    <Tab id="tab1">タブ1</Tab>
    <Tab id="tab2">タブ2</Tab>
  </TabList>
  <TabPanel id="tab1">コンテンツ1</TabPanel>
  <TabPanel id="tab2">コンテンツ2</TabPanel>
</Tabs>
```

---

## カスタムフック

### データフェッチング

```tsx
interface UseFetchResult<T> {
  data: T | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useFetch<T>(url: string): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e : new Error('Unknown error'));
    } finally {
      setIsLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, isLoading, error, refetch: fetchData };
}
```

### トグル状態

```tsx
function useToggle(initialValue = false) {
  const [value, setValue] = useState(initialValue);

  const toggle = useCallback(() => setValue(v => !v), []);
  const setTrue = useCallback(() => setValue(true), []);
  const setFalse = useCallback(() => setValue(false), []);

  return { value, toggle, setTrue, setFalse };
}

// 使用例
const { value: isOpen, toggle, setFalse: close } = useToggle();
```

### デバウンス

```tsx
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

// 使用例: 検索入力
const [search, setSearch] = useState('');
const debouncedSearch = useDebounce(search, 300);

useEffect(() => {
  if (debouncedSearch) {
    searchAPI(debouncedSearch);
  }
}, [debouncedSearch]);
```

---

## 状態管理

### Context + useReducer

外部ライブラリなしで型安全な状態管理。

```tsx
// types
interface AppState {
  user: User | null;
  theme: 'light' | 'dark';
  notifications: Notification[];
}

type AppAction =
  | { type: 'SET_USER'; payload: User | null }
  | { type: 'SET_THEME'; payload: 'light' | 'dark' }
  | { type: 'ADD_NOTIFICATION'; payload: Notification }
  | { type: 'REMOVE_NOTIFICATION'; payload: string };

// reducer
const appReducer = (state: AppState, action: AppAction): AppState => {
  switch (action.type) {
    case 'SET_USER':
      return { ...state, user: action.payload };
    case 'SET_THEME':
      return { ...state, theme: action.payload };
    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, action.payload] };
    case 'REMOVE_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.payload),
      };
    default:
      return state;
  }
};

// context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// provider
const AppProvider = ({ children }: { children: React.ReactNode }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

// hook
const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
```

---

## Next.js パフォーマンス最適化

> Vercel react-best-practices (259K installs) に基づく Next.js 固有の最適化パターン

### CRITICAL: Waterfall の排除

データフェッチの連鎖（Waterfall）はパフォーマンスの最大の敵。

```tsx
// ❌ 悪い例: 直列フェッチ（Waterfall）
async function Page() {
  const user = await getUser();        // 200ms
  const posts = await getPosts(user.id); // 300ms → 合計 500ms
  return <Feed user={user} posts={posts} />;
}

// ✅ 良い例: 並列フェッチ
async function Page() {
  const userPromise = getUser();
  const postsPromise = getPosts(); // user.id が不要なら並列化
  const [user, posts] = await Promise.all([userPromise, postsPromise]);
  return <Feed user={user} posts={posts} />;
}

// ✅ 良い例: Suspense で段階的表示
async function Page() {
  const user = await getUser();
  return (
    <>
      <UserHeader user={user} />
      <Suspense fallback={<PostsSkeleton />}>
        <PostsList userId={user.id} />
      </Suspense>
    </>
  );
}
```

### CRITICAL: Bundle Size の最適化

```tsx
// ❌ 悪い例: barrel import（ツリーシェイキング不可）
import { Button, Icon, Modal } from '@/components';

// ✅ 良い例: 直接 import
import { Button } from '@/components/Button';
import { Icon } from '@/components/Icon';
import { Modal } from '@/components/Modal';

// ❌ 悪い例: 重いライブラリを同期 import
import { format } from 'date-fns';
import lodash from 'lodash';

// ✅ 良い例: 動的 import + 軽量代替
import { format } from 'date-fns/format'; // サブパス import
// lodash の代わりにネイティブメソッド or 個別 import
import groupBy from 'lodash/groupBy';

// ✅ 良い例: サードパーティを動的ロード
const HeavyChart = dynamic(() => import('@/components/Chart'), {
  loading: () => <ChartSkeleton />,
  ssr: false,
});
```

### HIGH: サーバーサイドパフォーマンス

```tsx
// ✅ React.cache() でリクエスト内のデータ重複排除
import { cache } from 'react';

const getUser = cache(async (id: string) => {
  return db.user.findUnique({ where: { id } });
});

// 同じリクエスト内で複数回呼んでも1回しか実行されない
async function Layout() {
  const user = await getUser(userId); // DB クエリ 1回目
  return <Nav user={user}><Slot /></Nav>;
}

async function Page() {
  const user = await getUser(userId); // キャッシュヒット（DB クエリなし）
  return <Profile user={user} />;
}

// ✅ after() でレスポンス後に非同期処理
import { after } from 'next/server';

export async function POST(request: Request) {
  const data = await request.json();
  const result = await saveData(data);

  after(async () => {
    await logAnalytics(result); // レスポンス後に実行
    await sendNotification(result);
  });

  return Response.json(result); // 先にレスポンスを返す
}
```

### MEDIUM: Re-render の最適化

```tsx
// ❌ 悪い例: 派生値を state にする（無駄な re-render の原因）
const [items, setItems] = useState<Item[]>([]);
const [filteredItems, setFilteredItems] = useState<Item[]>([]);
const [filter, setFilter] = useState('');

useEffect(() => {
  setFilteredItems(items.filter(item => item.name.includes(filter)));
}, [items, filter]);

// ✅ 良い例: useMemo で派生値を計算（state を減らす）
const [items, setItems] = useState<Item[]>([]);
const [filter, setFilter] = useState('');

const filteredItems = useMemo(
  () => items.filter(item => item.name.includes(filter)),
  [items, filter],
);

// ✅ 良い例: 重い更新を useDeferredValue で遅延
function SearchResults({ query }: { query: string }) {
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(() => search(deferredQuery), [deferredQuery]);
  return <List items={results} />;
}

// ✅ 良い例: startTransition で低優先度更新
function handleTabChange(tab: string) {
  startTransition(() => {
    setActiveTab(tab); // UI のブロックなしに更新
  });
}
```

---


---

> 続き: [frontend-patterns-2.md](frontend-patterns-2.md)
