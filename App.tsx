import { type ReactNode } from 'react';
import { useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  getGetOrdersQueryKey,
  useCreateOrder,
  useGetOrders,
  useUpdateOrderStatus,
  type Order,
} from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { ArrowLeft, ArrowLeftRight, BriefcaseBusiness, CalendarDays, CarFront, Check, CircleCheck, Clock3, Info, MapPin, Minus, Plus, Power, Route as RouteIcon, ShieldCheck, Sparkles, TriangleAlert, UserRound } from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();
const makeOrderKey = (from: string, to: string, tariff: Order['tariff']) =>
  JSON.stringify([from.trim().toLocaleLowerCase(), to.trim().toLocaleLowerCase(), tariff]);

function upsertOrder(current: Order[] | undefined, updated: Order): Order[] {
  return current
    ? [updated, ...current.filter((order) => order.id !== updated.id)]
    : [updated];
}

function AboutPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="about-main" data-testid="page-about">
      <button type="button" className="about-back" data-testid="button-about-back" onClick={onBack}>
        <ArrowLeft size={15} /> Назад в приложение
      </button>
      <section className="about-hero">
        <div className="about-brand-mark" aria-hidden="true">z<span>.</span></div>
        <div>
          <div className="about-kicker">О приложении</div>
          <h1>Zhetu Go для Алматы</h1>
          <p>Демонстрационный прототип заказа такси с отдельными режимами пассажира и водителя.</p>
          <span className="test-version-badge">Тестовая версия</span>
        </div>
      </section>
      <section className="about-warning-card" role="alert" data-testid="about-demo-warning">
        <TriangleAlert size={20} />
        <div>
          <strong>Заказы только демонстрационные</strong>
          <p>Реальные поездки не выполняются, реальный водитель не назначается. Не вводите банковские данные — оплата в приложении не подключена.</p>
        </div>
      </section>
      <div className="about-card-grid">
        <article className="about-info-card">
          <span className="about-info-icon"><CarFront size={17} /></span>
          <h2>Что можно проверить</h2>
          <p>Выбор маршрута и тарифа, примерную стоимость, переключение ролей, принятие и завершение демонстрационного заказа.</p>
        </article>
        <article className="about-info-card">
          <span className="about-info-icon"><Info size={17} /></span>
          <h2>Где хранятся заказы</h2>
          <p>Демонстрационные заказы хранятся в общей базе и синхронизируются между устройствами. Для последнего заказа пассажирский экран запоминает его номер в этом браузере.</p>
        </article>
      </div>
      <p className="about-storage-note">Это тестовые данные без реальных пассажиров, водителей, платежей или GPS.</p>
    </main>
  );
}

function Home() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'passenger' | 'driver'>('passenger');
  const [showAbout, setShowAbout] = useState(false);
  const [from, setFrom] = useState('Абая, 52');
  const [to, setTo] = useState('Парк Первого Президента');
  const [tariff, setTariff] = useState<Order['tariff']>('Эконом');
  const [orderCreated, setOrderCreated] = useState(false);
  const [passengerOrderId, setPassengerOrderId] = useState<string | null>(() => {
    try {
      return window.localStorage.getItem('zhetu-go-passenger-order-id');
    } catch {
      return null;
    }
  });
  const orderSubmitLock = useRef<string | null>(null);
  const [orderActionError, setOrderActionError] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [mapZoom, setMapZoom] = useState(1);
  const ordersQuery = useGetOrders({
    query: {
      queryKey: getGetOrdersQueryKey(),
      refetchInterval: 2500,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  });
  const orders = ordersQuery.data ?? [];
  const createOrderMutation = useCreateOrder({
    mutation: {
      onMutate: () => setOrderActionError(null),
      onSuccess: async (order) => {
        setPassengerOrderId(order.id);
        setOrderCreated(true);
        try {
          window.localStorage.setItem('zhetu-go-passenger-order-id', order.id);
        } catch {
          setOrderActionError('Заказ сохранён, но браузер не смог запомнить его для повторного открытия.');
        }
        queryClient.setQueryData<Order[]>(getGetOrdersQueryKey(), (current) => upsertOrder(current, order));
        await queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
      },
      onError: () => {
        orderSubmitLock.current = null;
        setOrderActionError('Не удалось сохранить общий заказ. Проверьте соединение и попробуйте ещё раз.');
      },
    },
  });
  const updateOrderStatusMutation = useUpdateOrderStatus({
    mutation: {
      onMutate: () => setOrderActionError(null),
      onSuccess: async (order) => {
        queryClient.setQueryData<Order[]>(getGetOrdersQueryKey(), (current) => upsertOrder(current, order));
        if (order.status === 'done') {
          if (orderSubmitLock.current === makeOrderKey(order.from, order.to, order.tariff)) {
            orderSubmitLock.current = null;
          }
          if (order.id === passengerOrderId) setOrderCreated(false);
        }
        await queryClient.invalidateQueries({ queryKey: getGetOrdersQueryKey() });
      },
      onError: () => setOrderActionError('Не удалось обновить статус. Обновите список и попробуйте ещё раз.'),
    },
  });

  const fare = Math.round((from.length + to.length + 14) * ({ Эконом: 83, Комфорт: 112, Бизнес: 158 }[tariff]) / 100) * 100 + ({ Эконом: 0, Комфорт: 250, Бизнес: 650 }[tariff]);
  const formatPrice = (value: number) => new Intl.NumberFormat('ru-RU').format(value);
  const passengerOrder = orders.find((order) => order.id === passengerOrderId) ?? null;
  const currentOrderKey = makeOrderKey(from, to, tariff);
  const hasPendingDuplicate = orders.some((order) =>
    order.origin === 'passenger' &&
    order.status !== 'done' &&
    order.tariff === tariff &&
    makeOrderKey(order.from, order.to, tariff) === currentOrderKey
  );
  const createOrder = () => {
    if (
      !from.trim() ||
      !to.trim() ||
      hasPendingDuplicate ||
      ordersQuery.isLoading ||
      ordersQuery.isError ||
      createOrderMutation.isPending ||
      orderSubmitLock.current === currentOrderKey
    ) return;
    orderSubmitLock.current = currentOrderKey;
    createOrderMutation.mutate({ data: { from: from.trim(), to: to.trim(), price: fare, tariff } });
  };
  const acceptOrder = (id: string) => {
    if (!online || updateOrderStatusMutation.isPending) return;
    updateOrderStatusMutation.mutate({ id, data: { status: 'accepted' } });
  };
  const finishOrder = (id: string) => {
    if (updateOrderStatusMutation.isPending) return;
    updateOrderStatusMutation.mutate({ id, data: { status: 'done' } });
  };
  const statusLabel = (status: Order['status']) => status === 'available' ? 'Ожидает водителя' : status === 'accepted' ? 'Заказ принят' : 'Поездка завершена';
  const passengerStatusLabel = (status: Order['status']) => status === 'accepted' ? 'Водитель назначен' : statusLabel(status);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand" aria-label="Zhetu Go">
          <div className="brand-mark" aria-hidden="true">z<span>.</span></div>
          <span>Zhetu Go</span>
        </div>
        <div className="topbar-right">
          <div className="city-tag"><MapPin size={15} strokeWidth={2.2} /> Алматы, Казахстан</div>
          {showAbout ? (
            <button type="button" className="about-return-top" onClick={() => setShowAbout(false)}><ArrowLeft size={15} />К приложению</button>
          ) : (
            <>
              <nav className="mode-switch" aria-label="Выбор режима">
                <button type="button" data-testid="mode-passenger" className={mode === 'passenger' ? 'active' : ''} aria-pressed={mode === 'passenger'} onClick={() => setMode('passenger')}><UserRound size={15} /> Пассажир</button>
                <button type="button" data-testid="mode-driver" className={mode === 'driver' ? 'active' : ''} aria-pressed={mode === 'driver'} onClick={() => setMode('driver')}><CarFront size={16} /> Водитель</button>
              </nav>
              <button type="button" className="about-link" data-testid="button-about" aria-label="О приложении" onClick={() => setShowAbout(true)}>
                <Info size={16} /><span>О приложении</span>
              </button>
            </>
          )}
        </div>
      </header>

      {showAbout ? (
        <AboutPage onBack={() => setShowAbout(false)} />
      ) : (
        <>
      <div className="demo-warning-wrap">
        <div className="demo-warning-banner" role="note" data-testid="demo-warning-banner">
          <TriangleAlert size={16} />
          <span><strong>Тестовая версия.</strong> Заказы демонстрационные; реальные поездки не выполняются.</span>
          <button type="button" onClick={() => setShowAbout(true)}>Подробнее</button>
        </div>
      </div>
      {ordersQuery.isLoading && <div className="order-connection-note" role="status">Подключаем общую базу демонстрационных заказов…</div>}
      {ordersQuery.isError && <div className="order-service-error" role="alert">Общие заказы пока недоступны. Проверьте соединение с сервером и обновите страницу.</div>}
      {orderActionError && <div className="order-service-error" role="alert">{orderActionError}</div>}
      {mode === 'passenger' ? (
        <main className="main-layout">
          <section className="booking-column" aria-label="Оформление поездки">
            <div className="welcome-row">
              <div>
                <div className="eyebrow">Ваш город. Ваш маршрут.</div>
                <h1>Добрый день!</h1>
                <p>Куда отправимся сегодня?</p>
              </div>
              <div className="date-pill"><CalendarDays size={15} /> Сегодня</div>
            </div>

            <section className="panel" aria-labelledby="route-title">
              <div className="panel-heading"><h2 id="route-title">Маршрут поездки</h2><span className="step-chip">01</span></div>
              <div className="route-inputs">
                <div className="route-link" aria-hidden="true" />
                <label className="route-input">
                  <span className="route-dot" aria-hidden="true" />
                  <input aria-label="Откуда" data-testid="input-from" value={from} onChange={(event) => { setFrom(event.target.value); setOrderCreated(false); }} placeholder="Откуда" />
                  <MapPin size={16} color="#aaa7b1" aria-hidden="true" />
                </label>
                <label className="route-input">
                  <span className="route-dot destination" aria-hidden="true" />
                  <input aria-label="Куда" data-testid="input-to" value={to} onChange={(event) => { setTo(event.target.value); setOrderCreated(false); }} placeholder="Куда" />
                  <MapPin size={16} color="#aaa7b1" aria-hidden="true" />
                </label>
                <button type="button" className="route-swap" data-testid="button-swap-route" aria-label="Поменять точки маршрута местами" onClick={() => { setFrom(to); setTo(from); setOrderCreated(false); }}><ArrowLeftRight size={15} /></button>
              </div>
              <div className="location-hint"><span>Укажите адреса в Алматы</span><span>Ручной ввод</span></div>
            </section>

            <section className="panel" aria-labelledby="tariff-title">
              <div className="panel-heading"><h2 id="tariff-title">Выберите тариф</h2><span className="step-chip">02</span></div>
              <div className="tariff-grid" role="group" aria-label="Тариф">
                {([
                  { name: 'Эконом' as const, Icon: CarFront, detail: 'Практично', eta: '3–5 мин' },
                  { name: 'Комфорт' as const, Icon: Sparkles, detail: 'Больше места', eta: '5–7 мин' },
                  { name: 'Бизнес' as const, Icon: BriefcaseBusiness, detail: 'Особый класс', eta: '7–10 мин' },
                ]).map(({ name, Icon, detail, eta }) => (
                  <button key={name} type="button" data-testid={`tariff-${name.toLowerCase()}`} className={`tariff-option ${tariff === name ? 'selected' : ''}`} aria-pressed={tariff === name} onClick={() => { setTariff(name); setOrderCreated(false); }}>
                    <span className="tariff-top"><span>{name}</span><span className="tariff-icon"><Icon size={16} /></span></span>
                    <span className="tariff-meta"><span>{detail}</span><span>{eta}</span></span>
                  </button>
                ))}
              </div>
            </section>

            <section className="panel" aria-label="Стоимость поездки">
              <div className="fare-row">
                <div><div className="eyebrow" style={{ marginBottom: 5 }}>03 · Стоимость</div><div className="fare-copy">Предварительная оценка</div></div>
                <div className="fare-value" data-testid="text-estimated-fare">{formatPrice(fare)}<small>₸</small></div>
              </div>
              <div style={{ height: 16 }} />
              <button type="button" className="order-button" data-testid="button-order-taxi" onClick={createOrder} disabled={!from.trim() || !to.trim() || hasPendingDuplicate || ordersQuery.isLoading || ordersQuery.isError || createOrderMutation.isPending} aria-busy={createOrderMutation.isPending}>
                <CarFront size={18} /> {createOrderMutation.isPending ? 'Сохраняем заказ…' : hasPendingDuplicate ? 'Заказ уже оформлен' : 'Заказать такси'} <span aria-hidden="true">·</span> {formatPrice(fare)} ₸
              </button>
            </section>
            {passengerOrder && (
              <div className={`passenger-trip-card ${passengerOrder.status === 'done' ? 'is-complete' : ''}`} role="status" data-testid="status-passenger-order">
                <div className="trip-card-heading">
                  <div>
                    <strong>{orderCreated ? 'Демонстрационный заказ создан' : `Заказ №${passengerOrder.id.slice(3)}`}</strong>
                    <span>{passengerOrder.from} → {passengerOrder.to}</span>
                  </div>
                  <span className={`status-badge ${passengerOrder.status}`} data-testid="status-passenger-order-label">{passengerStatusLabel(passengerOrder.status)}</span>
                </div>
                <div className="trip-card-foot">
                  {passengerOrder.status === 'done' ? (
                    <><span>Поездка завершена</span><strong data-testid="text-final-fare">Итоговая стоимость · {formatPrice(passengerOrder.price)} ₸</strong></>
                  ) : passengerOrder.status === 'accepted' ? (
                    <span>Водитель принял заказ. Можно отправляться.</span>
                  ) : (
                    <span>Ожидаем водителя · оплата не производится</span>
                  )}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px', color: '#96939d', fontSize: 11 }}><ShieldCheck size={14} color="#7650ad" /> Демонстрационный режим · без оплаты и передачи данных</div>
          </section>

          <section className="map-card" aria-label="Схематичная карта Алматы">
            <div className="map-head"><MapPin size={16} color="#7d4bc5" /><strong>Алматы</strong><span>карта-схема</span></div>
            <span className="map-pin-label from"><i className="map-dot" />Старт</span>
            <span className="map-pin-label to"><i className="map-dot" style={{ background: '#25232b', boxShadow: '0 0 0 5px #25232b18' }} />Финиш</span>
            <span className="map-pin-label center">Площадь Республики</span>
            <svg className="map-svg" data-testid="map-schematic" viewBox="0 0 800 700" role="img" aria-label="Схематичная карта улиц Алматы, не показывает текущее местоположение" style={{ transform: `scale(${mapZoom})`, transformOrigin: 'center' }}>
              <rect width="800" height="700" fill="#f1f0ed" />
              <path d="M0 94 C180 126 280 58 430 104 S670 136 800 84M0 190 C170 218 289 156 436 195 S666 224 800 179M0 296 C188 326 297 261 454 300 S652 325 800 281M0 407 C163 436 305 375 459 416 S668 442 800 394M0 520 C181 546 289 484 449 525 S661 548 800 510M0 621 C178 650 323 584 469 626 S668 648 800 614" fill="none" stroke="#fff" strokeWidth="17" />
              <path d="M101 0 C136 150 78 231 131 370 S163 558 126 700M247 0 C281 156 229 237 276 381 S299 555 271 700M393 0 C426 150 374 250 420 381 S450 560 416 700M550 0 C572 156 532 255 571 390 S604 570 564 700M696 0 C717 153 680 250 714 390 S743 567 709 700" fill="none" stroke="#fff" strokeWidth="15" />
              <path d="M0 94 C180 126 280 58 430 104 S670 136 800 84M0 296 C188 326 297 261 454 300 S652 325 800 281M0 520 C181 546 289 484 449 525 S661 548 800 510M247 0 C281 156 229 237 276 381 S299 555 271 700M550 0 C572 156 532 255 571 390 S604 570 564 700" fill="none" stroke="#e3e0e0" strokeWidth="1.3" />
              <path d="M0 350 C182 348 266 343 351 333 C444 322 503 263 570 224 C640 184 720 194 800 177" fill="none" stroke="#9161d2" strokeWidth="5" strokeLinecap="round" strokeDasharray="1 0" />
              <path d="M32 36 C117 59 140 23 215 51L203 112 82 126 20 95ZM312 128L376 112 396 176 342 193ZM466 323L534 300 551 368 481 385ZM633 437L727 411 745 493 653 508Z" fill="#dfe9da" opacity=".9" />
              <path d="M0 670 C110 633 172 669 245 638 S394 630 483 656 S668 673 800 630" fill="none" stroke="#dfebe5" strokeWidth="40" opacity=".8" />
              <text x="35" y="160" fill="#aaa7a4" fontSize="12" fontFamily="DM Sans">Бостандыкский район</text>
              <text x="417" y="470" fill="#aaa7a4" fontSize="12" fontFamily="DM Sans">Медеуский район</text>
              <text x="568" y="118" fill="#aaa7a4" fontSize="11" fontFamily="DM Sans">Алмалинский район</text>
              <circle cx="245" cy="334" r="10" fill="#8a55d1" stroke="#fff" strokeWidth="5" />
              <circle cx="570" cy="224" r="10" fill="#26232c" stroke="#fff" strokeWidth="5" />
            </svg>
            <div className="map-caption">Схематичная карта · не в реальном времени</div>
            <div className="map-toolbar">
              <button type="button" className="map-tool" data-testid="button-map-zoom-in" aria-label="Приблизить карту" onClick={() => setMapZoom((zoom) => Math.min(zoom + 0.08, 1.24))}><Plus size={16} /></button>
              <button type="button" className="map-tool" data-testid="button-map-zoom-out" aria-label="Отдалить карту" onClick={() => setMapZoom((zoom) => Math.max(zoom - 0.08, 0.84))}><Minus size={16} /></button>
            </div>
          </section>
        </main>
      ) : (
        <main className="driver-main">
          <div className="welcome-row">
            <div><div className="eyebrow">Кабинет водителя · Алматы</div><h1 style={{ fontFamily: 'var(--app-font-serif)', fontSize: 'clamp(28px, 3vw, 38px)', letterSpacing: '-1.8px', margin: '9px 0 6px' }}>На линии — по вашим правилам.</h1><p style={{ color: '#777681', fontSize: 14, margin: 0 }}>Принимайте демонстрационные заказы и управляйте поездками.</p></div>
            <div className="driver-header-actions">
              <button type="button" className="return-passenger" data-testid="button-return-passenger" onClick={() => setMode('passenger')}><ArrowLeft size={15} />К экрану пассажира</button>
              <div className="date-pill"><CalendarDays size={15} /> Сегодня</div>
            </div>
          </div>
          <div className="driver-grid">
            <section className="driver-hero" aria-label="Статус водителя">
              <div className="eyebrow" style={{ color: '#aaa8b0' }}>Ваш статус</div>
              <h2>{online ? 'Вы на линии' : 'Вы не на линии'}</h2>
              <p>{online ? 'Новые демонстрационные заказы доступны для принятия.' : 'Включите статус, чтобы принимать учебные заказы.'}</p>
              <button type="button" className={`online-toggle ${online ? 'is-online' : ''}`} data-testid="button-go-online" aria-pressed={online} onClick={() => setOnline((current) => !current)}><span className="online-indicator" />{online ? 'Завершить смену' : 'Выйти на линию'}<Power size={15} /></button>
            </section>
            <div className="driver-stats">
              <div className="stat-card"><span>Заказов выполнено</span><strong data-testid="text-completed-count">{orders.filter((order) => order.status === 'done').length}</strong></div>
              <div className="stat-card"><span>Доступно сейчас</span><strong data-testid="text-available-count">{orders.filter((order) => order.status === 'available').length}</strong></div>
              <div className="stat-card"><span>Заказ принят</span><strong style={{ fontSize: 17 }}>{orders.some((order) => order.status === 'accepted') ? 'Есть' : 'Нет'}</strong></div>
              <div className="stat-card"><span>Режим приложения</span><strong style={{ fontSize: 17 }}>Демо</strong></div>
            </div>
          </div>
          <section className="panel orders-panel">
            <div className="orders-title"><h2>Заказы рядом</h2><span><RouteIcon size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Демонстрационные маршруты</span></div>
            <div className="order-list">
              {orders.map((order) => (
                <article className="driver-order" key={order.id} data-testid={`card-order-${order.id}`}>
                  <div className="order-route">
                    <span className="route-marker" aria-hidden="true" /><span>{order.from}</span>
                    <span className="route-marker end" aria-hidden="true" /><span>{order.to}</span>
                    <span /><span className="order-sub"><Clock3 size={11} style={{ verticalAlign: '-2px', marginRight: 4 }} />{order.time} · {order.id}</span>
                  </div>
                  <div className="order-side">
                    <span className="order-price-label">{order.status === 'done' ? 'Итоговая стоимость' : 'Стоимость поездки'}</span>
                    <span className="order-price" data-testid={`text-order-fare-${order.id}`}>{formatPrice(order.price)} ₸</span>
                    <span className={`status-badge ${order.status}`} data-testid={`status-order-${order.id}`}>{statusLabel(order.status)}</span>
                    {order.status === 'available' ? (
                      <button type="button" className="order-action" data-testid={`button-accept-${order.id}`} disabled={!online || updateOrderStatusMutation.isPending} onClick={() => acceptOrder(order.id)}>Принять заказ</button>
                    ) : order.status === 'accepted' ? (
                      <button type="button" className="order-action" data-testid={`button-finish-${order.id}`} disabled={updateOrderStatusMutation.isPending} onClick={() => finishOrder(order.id)}><Check size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />Завершить поездку</button>
                    ) : <span style={{ color: '#77a184', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}><CircleCheck size={14} />Готово</span>}
                  </div>
                </article>
              ))}
              {ordersQuery.isLoading && <div className="driver-empty">Загружаем общие демонстрационные заказы…</div>}
              {!ordersQuery.isLoading && !ordersQuery.isError && orders.length === 0 && <div className="driver-empty">Заказов пока нет. Новые демонстрационные маршруты появятся здесь.</div>}
            </div>
          </section>
          <p style={{ textAlign: 'center', fontSize: 10, color: '#a09da6', margin: '17px 0 0' }}>Демонстрационный режим · реальные поездки, пассажиры и оплата не подключены</p>
        </main>
      )}
        </>
      )}
      <footer className="footer-note">ZHETU GO · Демонстрационный сервис для города Алматы</footer>
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
