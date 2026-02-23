'use client';

import { useState, useEffect, useCallback } from 'react';
import { ShoppingList, Ingredient, SHOPPING_CATEGORIES } from './types';
import { format, addDays, startOfWeek, addWeeks } from 'date-fns';
import { ShoppingBag, Calendar, AlertCircle, ChevronLeft, ChevronRight, Loader2, Info, HelpCircle, Sun, Moon, ChevronDown, ChevronUp } from 'lucide-react';
import InfoModal from './components/InfoModal';


export default function Home() {
  const [selectedDate, setSelectedDate] = useState<Date>(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ShoppingList | null>(null);
  // チェック状態はDB固有のIDまたは材料名で管理（DB保存後はIDを優先）
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set());
  const [memo, setMemo] = useState<string>('');
  const [isFeaturesModalOpen, setIsFeaturesModalOpen] = useState(false);
  const [isAccuracyModalOpen, setIsAccuracyModalOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [selectedIngredient, setSelectedIngredient] = useState<Ingredient | null>(null);


  const weekStartDateStr = format(selectedDate, 'yyyyMMdd');

  // DBからリストを取得する関数
  const fetchSavedList = useCallback(async (dateStr: string) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/list?weekStartDate=${dateStr}`);
      const data = await response.json();

      if (response.ok && data.found) {
        setResult({
          recipes: data.data.recipes,
          ingredients: data.data.ingredients
        });
        setActiveDates(new Set(data.data.activeDates));
        setMemo(data.data.memo || '');


        // チェック状態の復元
        const newChecked = new Set<string>();
        data.data.ingredients.forEach((ing: Ingredient) => {
          if (ing.isChecked && ing.id) {
            newChecked.add(ing.id);
          }
        });
        setCheckedItems(newChecked);
      } else {
        // データがない場合はリセット
        setResult(null);
        setCheckedItems(new Set());
        setActiveDates(new Set());
      }
    } catch (err) {
      console.error('Failed to fetch saved list:', err);
      setError('データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  // 週が切り替わった時に自動読み込み
  useEffect(() => {
    fetchSavedList(weekStartDateStr);
  }, [weekStartDateStr, fetchSavedList]);

  // テーマの初期化と反映
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
      setIsDarkMode(true);
      document.body.classList.add('dark');
    }
  }, []);

  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    if (newMode) {
      document.body.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.body.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  const changeWeek = (offset: number) => {
    setSelectedDate(prev => addWeeks(prev, offset));
    setMemo(''); // 週を切り替えたら一旦クリア（fetchで取得されるまで）
  };

  // メモの自動保存ロジック (Debounce)
  useEffect(() => {
    if (!result && memo === '') return;

    const timer = setTimeout(async () => {
      try {
        await fetch('/api/list/memo', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weekStartDate: weekStartDateStr, memo }),
        });
      } catch (err) {
        console.error('Failed to auto-save memo:', err);
      }
    }, 1000); // 1秒入力が止まったら保存

    return () => clearTimeout(timer);
  }, [memo, weekStartDateStr, result]);

  // 生成したリストをDBに保存する共通関数
  const saveToDb = async (listData: ShoppingList, active: Set<string>) => {
    try {
      const response = await fetch('/api/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weekStartDate: weekStartDateStr,
          recipesData: listData.recipes,
          activeDates: Array.from(active),
          ingredients: listData.ingredients
        }),
      });
      const data = await response.json();
      if (response.ok) {
        // 保存後のIDが付与された材料リストで更新
        setResult({
          recipes: listData.recipes,
          ingredients: data.ingredients
        });
      }
    } catch (err) {
      console.error('Failed to save list to DB:', err);
    }
  };

  const generateList = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setCheckedItems(new Set());
    setActiveDates(new Set());

    const dateStrings = [];
    for (let i = 0; i < 5; i++) {
      const date = addDays(selectedDate, i);
      dateStrings.push(format(date, 'yyyyMMdd'));
    }

    const urls = dateStrings.map(d => `https://www.lettuceclub.net/recipe/kondate/detail/k${d}/`);

    try {
      const response = await fetch('/api/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || 'リストの生成に失敗しました');
      }

      const successDates = data.recipes
        .filter((r: any) => r.status === 'success')
        .map((r: any) => r.date);
      const newActive = new Set<string>(successDates);

      setResult(data);
      setActiveDates(newActive);

      // DBに初保存
      await saveToDb(data, newActive);

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const updateList = async () => {
    if (!result) return;

    setLoading(true);
    setError('');

    const targetIngredients: string[] = [];
    result.recipes.forEach(recipe => {
      if (activeDates.has(recipe.date) && recipe.rawIngredients) {
        targetIngredients.push(recipe.rawIngredients);
      }
    });

    if (targetIngredients.length === 0) {
      setError('集計対象の献立がありません');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/aggregate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ingredientsData: targetIngredients }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.details || data.error || '再集計に失敗しました');
      }

      const newList = { ...result, ingredients: data.ingredients };

      // DBを新しい材料構成で更新（上書き）
      await saveToDb(newList, activeDates);
      // saveToDb内でsetResultされる

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const toggleDate = (date: string) => {
    if (!result) return;
    const newActive = new Set(activeDates);
    if (newActive.has(date)) {
      newActive.delete(date);
    } else {
      newActive.add(date);
    }
    setActiveDates(newActive);
  };

  const toggleItem = async (ing: Ingredient) => {
    if (!ing.id) return; // IDがない（保存前）場合は何もしない

    const isChecked = !checkedItems.has(ing.id);

    // オプティミスティック更新
    const newChecked = new Set(checkedItems);
    if (isChecked) {
      newChecked.add(ing.id);
    } else {
      newChecked.delete(ing.id);
    }
    setCheckedItems(newChecked);

    // DB更新
    try {
      await fetch('/api/list/check', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId: ing.id, isChecked }),
      });
    } catch (err) {
      console.error('Failed to update check status in DB:', err);
      // 失敗した場合は元に戻す
      setCheckedItems(checkedItems);
    }
  };


  const toggleCategory = (category: string) => {
    const newCollapsed = new Set(collapsedCategories);
    if (newCollapsed.has(category)) {
      newCollapsed.delete(category);
    } else {
      newCollapsed.add(category);
    }
    setCollapsedCategories(newCollapsed);
  };

  // カテゴリごとのグループ化
  const groupIngredients = (ingredients: Ingredient[]) => {
    if (!ingredients) return {} as Record<string, Ingredient[]>;
    return ingredients.reduce((acc, curr) => {
      const category = curr.category || 'その他';
      if (!acc[category]) acc[category] = [];
      acc[category].push(curr);
      return acc;
    }, {} as Record<string, Ingredient[]>);
  };

  // 期間表示用文字列
  const weekLabel = `${format(selectedDate, 'M/d')} ~ ${format(addDays(selectedDate, 4), 'M/d')}`;

  return (
    <main className="container-custom relative">
      {/* Theme Toggle Button */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={toggleDarkMode}
          className="p-2 rounded-full glass-panel hover:bg-pink-50 dark:hover:bg-gray-700 transition-colors shadow-sm border border-pink-100 dark:border-gray-600"
          title={isDarkMode ? 'ライトモードに切り替え' : 'ダークモードに切り替え'}
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5 text-yellow-500" />
          ) : (
            <Moon className="w-5 h-5 text-pink-400" />
          )}
        </button>
      </div>

      {/* Header */}
      <header className="text-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-4xl font-bold gradient-text mb-2 flex items-center justify-center gap-2 md:gap-3">
          <ShoppingBag className="w-6 h-6 md:w-8 md:h-8 text-pink-400" />
          AI Shopping List
        </h1>
        <p className="text-sm md:text-base text-gray-500 dark:text-pink-100 font-medium px-4">レタスクラブの献立から、あなたのための買い物リストを提案します</p>

        <div className="flex items-center justify-center gap-4 mt-4 text-sm">
          <button
            onClick={() => setIsFeaturesModalOpen(true)}
            className="flex items-center gap-1.5 text-pink-500 hover:text-pink-600 dark:text-pink-300 dark:hover:text-pink-200 transition-colors font-medium border-b border-pink-200 hover:border-pink-500 pb-0.5"
          >
            <Info className="w-4 h-4" />
            アプリの特徴
          </button>
          <button
            onClick={() => setIsAccuracyModalOpen(true)}
            className="flex items-center gap-1.5 text-gray-500 hover:text-gray-600 dark:text-gray-300 dark:hover:text-gray-200 transition-colors font-medium border-b border-gray-200 hover:border-gray-500 pb-0.5"
          >
            <HelpCircle className="w-4 h-4" />
            集計の正確性について
          </button>
        </div>
      </header>


      {/* Control Panel */}
      <div className="glass-panel p-4 md:p-6 mb-6 md:mb-8 text-center animate-fade-in shadow-xl mx-auto max-w-2xl md:max-w-none">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 md:gap-6 mb-4 md:mb-6">
          <div className="flex items-center gap-2 md:gap-4 bg-white/80 p-1.5 md:p-2 rounded-full shadow-sm backdrop-blur-sm w-full md:w-auto justify-between md:justify-start">
            <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-pink-100 rounded-full text-pink-500 transition-colors">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 px-2 md:px-4 font-bold text-gray-700 text-sm md:text-base">
              <Calendar className="w-4 h-4 md:w-5 md:h-5 text-pink-400" />
              <span>{weekLabel}</span>
            </div>
            <button onClick={() => changeWeek(1)} className="p-2 hover:bg-pink-100 rounded-full text-pink-500 transition-colors">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <button
            onClick={generateList}
            disabled={loading}
            className="btn-primary flex items-center justify-center gap-2 px-8 w-full md:w-auto py-3 md:py-2 text-base md:text-lg shadow-lg active:scale-95 transition-transform"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShoppingBag className="w-5 h-5" />}
            {loading ? 'AIが考え中...' : 'リストを作成'}
          </button>
        </div>

        {/* Weekly Memo Section */}
        <div className="mt-6 max-w-xl mx-auto">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-r from-pink-200 to-rose-200 rounded-2xl blur opacity-25 group-focus-within:opacity-50 transition duration-1000"></div>
            <div className="relative glass-panel p-4 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-pink-500 dark:text-pink-400 font-bold text-sm border-b border-pink-50 dark:border-pink-900/30 pb-2">
                <span className="text-lg">📝</span>
                <span>お買い物メモ（週ごとの備忘録）</span>
                <span className="ml-auto text-[10px] font-normal text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-2 py-0.5 rounded-full">自動保存中</span>
              </div>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="ここに「卵を買い足す」「パンも買う」などのメモを残せます..."
                className="w-full bg-transparent border-none focus:ring-0 text-gray-700 dark:text-white text-sm md:text-base resize-none min-h-[80px] custom-scrollbar placeholder:text-gray-300 dark:placeholder:text-gray-500 placeholder:italic"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50/90 backdrop-blur-sm text-red-500 p-4 rounded-xl flex items-center justify-center gap-2 border border-red-100">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        )}
      </div>

      {result && (
        <div className="grid md:grid-cols-3 gap-8 animate-fade-in-up">
          {/* Left Column: Recipes */}
          <div className="md:col-span-1 space-y-4">
            <div className="sticky top-4 bg-transparent pb-2 z-10">
              <h2 className="text-xl font-bold text-gray-700 dark:text-gray-100 flex items-center gap-2 mb-2">
                <span className="bg-pink-100 text-pink-500 p-1 rounded">📅</span> 今週の献立
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">不要な曜日のチェックを外して「再集計」を押してください</p>
              <button
                onClick={updateList}
                disabled={loading}
                className="w-full bg-white/50 hover:bg-white border border-pink-200 text-pink-600 font-bold py-2 px-4 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 text-sm"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : '🔄'} 選択した献立で再集計
              </button>
            </div>
            {result.recipes.map((menu, idx) => {
              const isActive = activeDates.has(menu.date);
              return (
                <div key={idx} className={`relative transition-all duration-300 ${isActive ? '' : 'opacity-50 grayscale'}`}>
                  <div className="absolute top-2 right-2 z-20">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={() => menu.status === 'success' && toggleDate(menu.date)}
                      disabled={menu.status === 'failed'}
                      className="w-5 h-5 accent-pink-500 cursor-pointer"
                    />
                  </div>
                  <a
                    href={menu.status === 'success' ? menu.url : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block card group relative overflow-hidden ${menu.status === 'failed' ? 'border-red-200 bg-red-50' : isActive ? 'hover:border-pink-300' : 'border-gray-200'}`}
                  >
                    <div className="flex flex-col h-full">
                      <div className="text-xs font-bold text-gray-400 dark:text-gray-500 mb-2 flex justify-between items-center border-b dark:border-gray-800 pb-1">
                        <span className="text-lg text-pink-500 dark:text-pink-400">{menu.dayOfWeek ? `${menu.dayOfWeek}` : '-'}</span>
                        <span className="text-[10px] bg-gray-100 dark:bg-gray-800 dark:text-gray-400 px-2 py-0.5 rounded-full">{menu.date}</span>
                      </div>

                      {menu.dishes && menu.dishes.length > 0 ? (
                        <div className="space-y-2">
                          {menu.dishes.map((dish, dIdx) => (
                            <div key={dIdx} className="flex items-start gap-2 group/dish">
                              {dish.imageUrl && (
                                <div className="shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-gray-100 dark:border-gray-800 shadow-sm transition-transform group-hover/dish:scale-110">
                                  <img
                                    src={dish.imageUrl.startsWith('/') ? `https://www.lettuceclub.net${dish.imageUrl}` : dish.imageUrl}
                                    alt={dish.title}
                                    className="w-full h-full object-cover"
                                    onError={(e) => (e.currentTarget.style.display = 'none')}
                                  />
                                </div>
                              )}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 mb-0.5">
                                  <span className={dish.type === 'main' ? 'tag-main shrink-0 dark:opacity-90' : 'tag-side shrink-0 dark:opacity-90'}>
                                    {dish.type === 'main' ? '主' : '副'}
                                  </span>
                                </div>
                                <span className={`text-sm leading-tight block ${dish.type === 'main' ? 'font-bold text-gray-700 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                                  {dish.title}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className={`font-bold ${menu.status === 'failed' ? 'text-gray-400' : 'text-gray-800'}`}>
                          {menu.status === 'failed' ? '取得失敗' : 'データなし'}
                        </div>
                      )}

                      {menu.status === 'failed' && (
                        <div className="text-red-400 text-xs mt-2 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> 取得失敗
                        </div>
                      )}
                    </div>
                  </a>
                </div>
              );
            })}
          </div>

          {/* Right Column: Shopping List */}
          <div className="md:col-span-2">
            <h2 className="text-xl font-bold text-gray-700 dark:text-white mb-4 flex items-center gap-2">
              <span className="bg-green-100 text-green-500 p-1 rounded">🛒</span> お買い物リスト
            </h2>

            <div className="space-y-6 pb-20">
              {/* 定義済みカテゴリの表示 */}
              {SHOPPING_CATEGORIES.map((category) => {
                const items = groupIngredients(result.ingredients)[category] || [];
                const hasItems = items.length > 0;
                const isCollapsed = collapsedCategories.has(category);

                return (
                  <div key={category} className={`glass-panel p-0 overflow-hidden transition-all ${!hasItems ? 'opacity-60' : ''}`}>
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full px-5 py-4 flex justify-between items-center bg-transparent hover:bg-white/30 dark:hover:bg-gray-800/30 transition-colors"
                    >
                      <h3 className="text-lg font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
                        {category}
                        {!hasItems && <span className="text-xs font-normal text-gray-400 dark:text-gray-500">無し</span>}
                      </h3>
                      <div className="text-gray-400">
                        {isCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="px-5 pb-5 animate-fade-in">
                        {hasItems ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-gray-100 dark:border-gray-800">
                            {items.map((item, idx) => {
                              const key = item.id || `${category}-${item.name}-${idx}`;
                              const isChecked = checkedItems.has(key);
                              return (
                                <div
                                  key={key}
                                  className={`flex items-start gap-3 p-2 rounded-lg transition-all cursor-pointer ${isChecked ? 'bg-gray-50 opacity-50' : 'hover:bg-white/50'}`}
                                >
                                  <div className="flex items-start gap-3 w-full group">
                                    <div className="relative pt-1 flex-shrink-0 z-10">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          toggleItem(item);
                                        }}
                                        className="checkbox-custom appearance-none w-5 h-5 border-2 border-gray-300 rounded focus:outline-none checked:bg-pink-500 checked:border-pink-500 transition-colors"
                                      />
                                    </div>
                                    <div
                                      className="flex-1 min-w-0"
                                      onClick={() => setSelectedIngredient(item)}
                                    >
                                      <div className="flex justify-between items-baseline mb-1">
                                        <span className={`font-medium text-base truncate pr-2 ${isChecked ? 'line-through text-gray-400 decoration-gray-300' : 'text-gray-700 dark:text-gray-200 group-hover:text-pink-600 transition-colors'}`}>
                                          {item.name}
                                        </span>
                                        <span className={`text-sm whitespace-nowrap ${isChecked ? 'text-gray-300' : 'text-pink-500 dark:text-pink-400 font-bold'}`}>
                                          {item.amount}
                                        </span>
                                      </div>

                                      {/* 使用曜日のバッジ表示 */}
                                      {item.usedDays && item.usedDays.length > 0 && (
                                        <div className={`flex flex-wrap gap-1 mt-0.5 ${isChecked ? 'opacity-50' : ''}`}>
                                          {item.usedDays.map(day => (
                                            <span key={day} className={`day-badge day-badge-${day} shadow-sm`}>{day}</span>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-sm text-gray-400 dark:text-gray-500 py-2 pl-2 border-t border-gray-100 dark:border-gray-800">
                            必要な材料はありません
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* 定義済みカテゴリ以外の「その他」表示 */}
              {Object.keys(groupIngredients(result.ingredients)).some(cat => !SHOPPING_CATEGORIES.includes(cat as any)) && (
                <div className="glass-panel p-0 overflow-hidden border-orange-100 dark:border-orange-900/30">
                  <div className="w-full px-5 py-4 bg-orange-50/30 dark:bg-orange-900/10 border-b border-orange-50 dark:border-orange-900/20">
                    <h3 className="text-lg font-bold text-orange-600 dark:text-orange-400 flex items-center gap-2">
                      その他（未分類）
                      <span className="text-xs font-normal opacity-70">AIが判断に迷った項目</span>
                    </h3>
                  </div>
                  <div className="px-5 pb-5 pt-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.entries(groupIngredients(result.ingredients))
                        .filter(([cat]) => !SHOPPING_CATEGORIES.includes(cat as any))
                        .flatMap(([cat, items]) => items)
                        .map((item, idx) => {
                          const key = item.id || `other-${item.name}-${idx}`;
                          const isChecked = checkedItems.has(key);
                          return (
                            <div
                              key={key}
                              className={`flex items-start gap-3 p-2 rounded-lg transition-all cursor-pointer ${isChecked ? 'bg-gray-50 opacity-50' : 'hover:bg-white/50'}`}
                            >
                              <div className="flex items-start gap-3 w-full group">
                                <div className="relative pt-1 flex-shrink-0 z-10">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      e.stopPropagation();
                                      toggleItem(item);
                                    }}
                                    className="checkbox-custom appearance-none w-5 h-5 border-2 border-gray-300 rounded focus:outline-none checked:bg-pink-500 checked:border-pink-500 transition-colors"
                                  />
                                </div>
                                <div className="flex-1 min-w-0" onClick={() => setSelectedIngredient(item)}>
                                  <div className="flex justify-between items-baseline mb-1">
                                    <span className={`font-medium text-base truncate pr-2 ${isChecked ? 'line-through text-gray-400 decoration-gray-300' : 'text-gray-700 dark:text-gray-200 group-hover:text-pink-600 transition-colors'}`}>
                                      {item.name}
                                    </span>
                                    <span className={`text-sm whitespace-nowrap ${isChecked ? 'text-gray-300' : 'text-pink-500 dark:text-pink-400 font-bold'}`}>
                                      {item.amount}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-gray-400 bg-gray-50 dark:bg-gray-800 px-1 inline-block rounded mb-1">
                                    分類: {item.category}
                                  </div>
                                  {item.usedDays && item.usedDays.length > 0 && (
                                    <div className={`flex flex-wrap gap-1 mt-0.5 ${isChecked ? 'opacity-50' : ''}`}>
                                      {item.usedDays.map(day => (
                                        <span key={day} className={`day-badge day-badge-${day} shadow-sm`}>{day}</span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Raw Data Display */}
            <div className="mt-12 border-t border-gray-200 pt-8">
              <details className="group">
                <summary className="flex items-center gap-2 cursor-pointer text-gray-400 hover:text-gray-600 transition-colors list-none">
                  <span className="transform group-open:rotate-90 transition-transform">▶</span>
                  <span className="font-bold text-sm">解析用生データを表示</span>
                </summary>
                <div className="mt-4 bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-xs overflow-x-auto shadow-inner">
                  <pre>
                    {result.recipes.map(r => r.rawIngredients).filter(Boolean).join('\n\n-------------------\n\n') || "データなし"}
                  </pre>
                </div>
              </details>
            </div>
          </div>
        </div>
      )}

      {/* Info Modals */}
      <InfoModal
        isOpen={isFeaturesModalOpen}
        onClose={() => setIsFeaturesModalOpen(false)}
        title="アプリの特徴"
      >
        <div className="space-y-6">
          <p>
            買い物リストの集計を正しく、かつ実用的に行うために、このアプリでは<strong className="text-pink-500">「LLM（Gemini API）によるセマンティック（意味論的）な集計」</strong>という設計を採用しています。
          </p>
          <p>
            単純な文字列一致による集計では、「鶏肉」と「鶏もも肉」を別物として扱ってしまったり、「大さじ1」と「小さじ3」を合算できなかったりしますが、以下の設計ポイントによってそれらを解決しています。
          </p>

          <section>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">1. プロンプトによる「意味の正規化」</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>表記ゆれの統一</strong>: 「鶏もも肉」と「とり肉」といった揺れを、AIが文脈から判断して標準的な名称に統一します。</li>
              <li><strong>単位を考慮した演算</strong>: 「1/2個」+「1.5個」=「2個」といった計算をAIに実行させています。また、単位が不明なものは「1本」「1パック」などの適切なデフォルト値を補完するよう指示しています。</li>
              <li><strong>合わせ調味料の分解</strong>: 「合わせ調味料（醤油、酒）」とあった場合、それをそのままリストに入れるのではなく、「醤油」「酒」という基本調味料に分解して集計します。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">2. カテゴリ分けによる実用性の向上</h3>
            <p>
              スーパーの売り場に合わせた分類: 「野菜・きのこ」「肉・ハム・ベーコン」など、実際の買い物動線を意識したカテゴリをAIに提示し、必ずその中から選ばせることで、リストが整理された状態で表示されます。
            </p>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">3. 多重のフォールバックによる堅牢性</h3>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong>マルチモデル・フォールバック</strong>: 最新のGeminiモデルが失敗した場合、安定版モデルを順次試行します。</li>
              <li><strong>最終フォールバック</strong>: AIによるパースが完全に失敗した場合は、最小限の整形のみを行った生テキストを表示します。</li>
            </ul>
          </section>

          <section>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-2">4. トレーサビリティ（追跡可能性）</h3>
            <p>
              「この食材、何を作るために買うんだっけ？」という疑問に応えるため、各食材に <strong>usedDays</strong>（月〜日のどの曜日の献立で使われるか）を紐持たせています。
            </p>
          </section>

          <p className="pt-4 border-t border-gray-100 text-sm font-medium">
            このように、「人間が買い物中に頭の中で行っている判断（似たものの統合、単位の計算、売り場ごとの整理）」をプロンプトを通じてAIに委譲しているのが、このアプリの集計設計の特徴です。
          </p>
        </div>
      </InfoModal>

      <InfoModal
        isOpen={isAccuracyModalOpen}
        onClose={() => setIsAccuracyModalOpen(false)}
        title="集計の正確性について"
      >
        <div className="space-y-6">
          <p className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-amber-800 text-sm">
            現在の設計（AIによる解析）では、「解析用生データには載っているのに、買い物リストには出てこない」ということは起こりえます。
          </p>

          <section>
            <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-3">主な原因</h3>
            <div className="space-y-4">
              <div>
                <h4 className="font-bold flex items-center gap-2">
                  <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs">1</span>
                  AIによる意図的な除外
                </h4>
                <p className="pl-7 text-sm">
                  「合わせ調味料」の分解や、水・塩などの「家にあることが自明なもの」をAIの判断で省略するケースがあります。
                </p>
              </div>
              <div>
                <h4 className="font-bold flex items-center gap-2">
                  <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs">2</span>
                  AIの「ハルシネーション（幻覚）」や「無視」
                </h4>
                <p className="pl-7 text-sm">
                  材料リストが非常に長い場合、中盤や終盤の材料の集計が漏れる可能性が技術的に排除できません。
                </p>
              </div>
              <div>
                <h4 className="font-bold flex items-center gap-2">
                  <span className="w-5 h-5 bg-gray-100 rounded-full flex items-center justify-center text-xs">3</span>
                  スクレイピング段階での失敗
                </h4>
                <p className="pl-7 text-sm">
                  Webサイトの構造変化により、生データの抽出そのものに失敗している場合があります。
                </p>
              </div>
            </div>
          </section>

          <section className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
            <h3 className="font-bold mb-2">対策について</h3>
            <p className="text-sm">
              この「漏れ」のリスクがあるため、画面下部の<strong>「解析用生データを表示」</strong>から生データを確認できるようにしています。
            </p>
          </section>

          <p className="text-sm text-gray-500">
            現在の設計は「利便性と手軽さ」を優先し、人間が考える手間をAIで最小化することに重きを置いた構成になっています。
          </p>
        </div>
      </InfoModal>

      {/* 食材詳細モーダル */}
      <InfoModal
        isOpen={!!selectedIngredient}
        onClose={() => setSelectedIngredient(null)}
        title="この食材を使う献立"
      >
        {selectedIngredient && result && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b dark:border-gray-800 pb-4">
              <h3 className="text-xl font-bold text-pink-600 dark:text-pink-400">
                {selectedIngredient.name}
              </h3>
              <span className="bg-pink-50 dark:bg-pink-900/30 text-pink-500 dark:text-pink-300 px-3 py-1 rounded-full font-bold">
                {selectedIngredient.amount}
              </span>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <span>🗓️</span> 以下の曜日のメニューで使用します：
              </p>

              <div className="grid gap-4">
                {result.recipes
                  .filter(menu => selectedIngredient.usedDays.includes(menu.dayOfWeek))
                  .map((menu, idx) => {
                    // この食材を使う特定の料理のみを抽出
                    // usedIn がある場合は dishTitle でフィルタリング、ない場合は全表示（フォールバック）
                    const targetDishes = menu.dishes.filter(dish => {
                      if (!selectedIngredient.usedIn) return true; // 既存データ用
                      return selectedIngredient.usedIn.some(
                        ui => ui.day === menu.dayOfWeek && ui.dishTitle === dish.title
                      );
                    });

                    if (targetDishes.length === 0) return null;

                    return (
                      <div key={idx} className="glass-panel p-4 dark:bg-gray-800/50 border border-pink-50 dark:border-pink-900/20">
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`day-badge day-badge-${menu.dayOfWeek} text-base px-3 py-1`}>
                            {menu.dayOfWeek}曜日
                          </span>
                          <span className="text-xs text-gray-400 dark:text-gray-500">{menu.date}</span>
                        </div>

                        <div className="space-y-3">
                          {targetDishes.map((dish, dIdx) => {
                            // この料理での使用分量を取得
                            const usage = selectedIngredient.usedIn?.find(
                              ui => ui.day === menu.dayOfWeek && ui.dishTitle === dish.title
                            );

                            return (
                              <div key={dIdx} className="flex gap-4 items-start">
                                {dish.imageUrl && (
                                  <div className="shrink-0 w-20 h-20 rounded-xl overflow-hidden border border-gray-100 dark:border-gray-700 shadow-sm">
                                    <img
                                      src={dish.imageUrl.startsWith('/') ? `https://www.lettuceclub.net${dish.imageUrl}` : dish.imageUrl}
                                      alt={dish.title}
                                      className="w-full h-full object-cover"
                                    />
                                  </div>
                                )}
                                <div className="flex-1">
                                  <div className="flex justify-between items-start gap-2">
                                    <span className={dish.type === 'main' ? 'tag-main mb-1' : 'tag-side mb-1'}>
                                      {dish.type === 'main' ? '主菜' : '副菜'}
                                    </span>
                                    {usage && (
                                      <span className="text-sm font-bold text-pink-500 bg-pink-50 dark:bg-pink-900/20 px-2 py-0.5 rounded">
                                        使用量: {usage.amount}
                                      </span>
                                    )}
                                  </div>
                                  <h4 className="font-bold text-gray-700 dark:text-gray-200 leading-tight">
                                    {dish.title}
                                  </h4>
                                  {dish.url && (
                                    <a
                                      href={dish.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-pink-500 hover:text-pink-600 dark:text-pink-400 mt-1 inline-block border-b border-pink-100 hover:border-pink-500"
                                    >
                                      レシピを見る →
                                    </a>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            <button
              onClick={() => setSelectedIngredient(null)}
              className="w-full py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              閉じる
            </button>
          </div>
        )}
      </InfoModal>
    </main>
  );
}

