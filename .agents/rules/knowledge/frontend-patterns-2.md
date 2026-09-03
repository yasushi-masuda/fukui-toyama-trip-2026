# frontend-patterns（続き）

> [frontend-patterns.md](frontend-patterns.md) の続き。

## パフォーマンス最適化

### メモ化

```tsx
// useMemo: 計算結果のキャッシュ
const expensiveValue = useMemo(() => {
  return items.filter(item => item.active).sort((a, b) => b.score - a.score);
}, [items]);

// useCallback: 関数参照の安定化
const handleClick = useCallback((id: string) => {
  setSelectedId(id);
}, []);  // 依存がないので関数は安定

// React.memo: コンポーネントの再レンダリング防止
const ListItem = React.memo(({ item, onClick }: ListItemProps) => {
  return <li onClick={() => onClick(item.id)}>{item.name}</li>;
});
```

### 遅延ローディング

```tsx
// コンポーネントの遅延ローディング
const HeavyComponent = lazy(() => import('./HeavyComponent'));

const Page = () => (
  <Suspense fallback={<Loading />}>
    <HeavyComponent />
  </Suspense>
);

// 条件付きローディング
const Modal = lazy(() => import('./Modal'));

const Page = () => {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button onClick={() => setShowModal(true)}>Open</button>
      {showModal && (
        <Suspense fallback={<Loading />}>
          <Modal onClose={() => setShowModal(false)} />
        </Suspense>
      )}
    </>
  );
};
```

### 仮想スクロール

大量リストの効率的なレンダリング。

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

const VirtualList = ({ items }: { items: Item[] }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 50,
  });

  return (
    <div ref={parentRef} style={{ height: '400px', overflow: 'auto' }}>
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map(virtualRow => (
          <div
            key={virtualRow.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {items[virtualRow.index].name}
          </div>
        ))}
      </div>
    </div>
  );
};
```

---

## フォーム

### 制御コンポーネント + バリデーション

```tsx
interface FormData {
  name: string;
  email: string;
  message: string;
}

interface FormErrors {
  name?: string;
  email?: string;
  message?: string;
}

const ContactForm = () => {
  const [data, setData] = useState<FormData>({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const newErrors: FormErrors = {};

    if (!data.name.trim()) {
      newErrors.name = '名前は必須です';
    }

    if (!data.email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      newErrors.email = '有効なメールアドレスを入力してください';
    }

    if (data.message.length > 500) {
      newErrors.message = 'メッセージは500文字以内で入力してください';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await submitForm(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <input
          value={data.name}
          onChange={e => setData(d => ({ ...d, name: e.target.value }))}
          aria-invalid={!!errors.name}
        />
        {errors.name && <span className="error">{errors.name}</span>}
      </div>
      {/* 他のフィールド */}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? '送信中...' : '送信'}
      </button>
    </form>
  );
};
```

---

## エラーバウンダリ

```tsx
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);
    // エラーログサービスに送信
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="error-container">
          <h2>エラーが発生しました</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}>
            再試行
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// 使用例
<ErrorBoundary fallback={<ErrorFallback />}>
  <RiskyComponent />
</ErrorBoundary>
```

---

## アクセシビリティ

### キーボードナビゲーション

```tsx
const Dropdown = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const options = ['Option 1', 'Option 2', 'Option 3'];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusIndex(i => Math.min(i + 1, options.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
      case ' ':
        if (focusIndex >= 0) {
          selectOption(options[focusIndex]);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        break;
    }
  };

  return (
    <div onKeyDown={handleKeyDown}>
      <button
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        選択
      </button>
      {isOpen && (
        <ul role="listbox">
          {options.map((option, index) => (
            <li
              key={option}
              role="option"
              aria-selected={focusIndex === index}
              tabIndex={focusIndex === index ? 0 : -1}
            >
              {option}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
```

### フォーカス管理

```tsx
const Modal = ({ isOpen, onClose, children }: ModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocus.current = document.activeElement as HTMLElement;
      modalRef.current?.focus();
    } else {
      previousFocus.current?.focus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      ref={modalRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
    >
      {children}
      <button onClick={onClose}>閉じる</button>
    </div>
  );
};
```

---

## React 19 対応

### forwardRef の廃止

```tsx
// ❌ React 18 以前: forwardRef が必要
const Input = forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <input ref={ref} {...props} />
));

// ✅ React 19: ref は通常の prop
function Input({ ref, ...props }: InputProps & { ref?: React.Ref<HTMLInputElement> }) {
  return <input ref={ref} {...props} />;
}
```

### use() API

```tsx
// ❌ 以前: useContext() のみ
const theme = useContext(ThemeContext);

// ✅ React 19: use() は条件付きで使える
function Component({ isLoggedIn }: { isLoggedIn: boolean }) {
  if (isLoggedIn) {
    const user = use(UserContext); // 条件分岐内で使用可能
    return <Dashboard user={user} />;
  }
  return <LoginPage />;
}
```

---

## 参考資料

- [React Documentation](https://react.dev/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Patterns.dev](https://www.patterns.dev/)
- [Web Accessibility Guidelines (WCAG)](https://www.w3.org/WAI/standards-guidelines/wcag/)
