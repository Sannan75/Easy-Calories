import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppData, DayLog, FavouriteFood, FoodLogEntry, MealSection } from './types'
import { emptyData, isValidImport, loadData, saveData } from './storage'

type Screen = 'today' | 'favourites' | 'history' | 'settings'

const meals: { id: MealSection; label: string; icon: string; empty: string }[] = [
  { id: 'breakfast', label: 'Breakfast', icon: '☀️', empty: 'Nothing logged. Suspicious, but allowed.' },
  { id: 'lunch', label: 'Lunch', icon: '🥪', empty: 'Lunch is currently a mystery.' },
  { id: 'dinner', label: 'Dinner', icon: '🍝', empty: 'Dinner has not yet entered the chat.' },
  { id: 'snacks', label: 'Snacks', icon: '🍪', empty: 'No snacks logged. Bold claim.' },
]

const addedMessages = [
  'Logged. The tiny food accountant is satisfied.',
  'Evidence secured. No courtroom required.',
  'Added. Snack maths is rude but useful.',
  'Noted with absolutely no raised eyebrows.',
  'In the notebook it goes. Very official-ish.',
]

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
const totalFor = (day?: DayLog) => day?.entries.reduce((sum, item) => sum + item.calories, 0) ?? 0
const roughly = (value: number) => `roughly ${value.toLocaleString()} kcals`

function summaryFor(total: number) {
  if (total < 700) return 'So far this is less a food day and more a rumour.'
  if (total < 2100) return 'Looks like a fairly normal human food day.'
  if (total < 3000) return 'Snack maths may have become management maths.'
  return 'The numbers are getting theatrical. Still no judgement.'
}

function App() {
  const [data, setData] = useState<AppData>(loadData)
  const [screen, setScreen] = useState<Screen>('today')
  const [toast, setToast] = useState('')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => saveData(data), [data])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  const addEntry = (name: string, calories: number, meal: MealSection) => {
    const date = todayKey()
    const entry: FoodLogEntry = { id: uid(), name: name.trim(), calories, meal, createdAt: new Date().toISOString() }
    setData((current) => ({
      ...current,
      days: {
        ...current.days,
        [date]: { date, entries: [...(current.days[date]?.entries ?? []), entry] },
      },
    }))
    setToast(addedMessages[Math.floor(Math.random() * addedMessages.length)])
  }

  const removeEntry = (id: string) => {
    const date = todayKey()
    setData((current) => ({
      ...current,
      days: { ...current.days, [date]: { date, entries: (current.days[date]?.entries ?? []).filter((e) => e.id !== id) } },
    }))
    setToast('Gone. The paperwork has been dramatically shredded.')
  }

  const saveFavourite = (name: string, calories: number, defaultMeal: MealSection) => {
    const favourite: FavouriteFood = { id: uid(), name: name.trim(), calories, defaultMeal, createdAt: new Date().toISOString() }
    setData((current) => ({ ...current, favourites: [...current.favourites, favourite] }))
    setToast('Saved among the usual suspects.')
  }

  const today = data.days[todayKey()]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">≈</div>
        <div><h1>Easy Calories</h1><p>Approximate calories.</p></div>
      </header>

      <main>
        {screen === 'today' && <TodayScreen day={today} onAdd={addEntry} onDelete={removeEntry} onFavourite={saveFavourite} onClear={() => {
          if (window.confirm('Clear today’s evidence? The crumbs will retain legal counsel.')) {
            const date = todayKey()
            setData((current) => ({ ...current, days: { ...current.days, [date]: { date, entries: [] } } }))
            setToast('Today cleared. A fresh and suspiciously tidy page.')
          }
        }} />}
        {screen === 'favourites' && <FavouritesScreen favourites={data.favourites} onAdd={(f) => addEntry(f.name, f.calories, f.defaultMeal)} onDelete={(id) => {
          setData((current) => ({ ...current, favourites: current.favourites.filter((f) => f.id !== id) }))
          setToast('Favourite removed. It knows what it did.')
        }} />}
        {screen === 'history' && <HistoryScreen days={data.days} selectedDate={selectedDate} onSelect={setSelectedDate} />}
        {screen === 'settings' && <SettingsScreen data={data} onImport={(next) => { setData(next); setToast('Backup restored. Past-you came prepared.') }} onClearAll={() => {
          if (window.confirm('Erase absolutely everything? This is the big red-ish button, minus the judgement.')) {
            setData(emptyData()); setToast('All data cleared. The notebook has amnesia.')
          }
        }} />}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
      <nav className="bottom-nav" aria-label="Main navigation">
        {([
          ['today', '⌂', 'Today'], ['favourites', '♡', 'Favourites'], ['history', '↶', 'History'], ['settings', '⚙', 'Settings'],
        ] as [Screen, string, string][]).map(([id, icon, label]) => (
          <button key={id} className={screen === id ? 'active' : ''} onClick={() => { setScreen(id); setSelectedDate(null) }} aria-current={screen === id ? 'page' : undefined}>
            <span aria-hidden="true">{icon}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function TodayScreen({ day, onAdd, onDelete, onFavourite, onClear }: {
  day?: DayLog
  onAdd: (name: string, calories: number, meal: MealSection) => void
  onDelete: (id: string) => void
  onFavourite: (name: string, calories: number, meal: MealSection) => void
  onClear: () => void
}) {
  const [formOpen, setFormOpen] = useState(false)
  const [defaultMeal, setDefaultMeal] = useState<MealSection>('breakfast')
  const total = totalFor(day)
  const dateLabel = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  return <div className="screen today-screen">
    <section className="hero-card">
      <div className="eyebrow">{dateLabel}</div>
      <p className="total-label">Today, approximately</p>
      <div className="day-total">{total.toLocaleString()} <small>kcals</small></div>
      <p className="summary">{summaryFor(total)}</p>
    </section>

    <div className="section-heading"><div><span className="eyebrow">The evidence</span><h2>Your food notebook</h2></div>{day?.entries.length ? <button className="text-button" onClick={onClear}>Clear today</button> : null}</div>
    <div className="meal-grid">
      {meals.map((meal) => {
        const entries = day?.entries.filter((e) => e.meal === meal.id) ?? []
        const subtotal = entries.reduce((sum, entry) => sum + entry.calories, 0)
        return <article className="meal-card" key={meal.id}>
          <div className="meal-title"><div className="meal-icon">{meal.icon}</div><div><h3>{meal.label}</h3><span>{roughly(subtotal)}</span></div>
            <button className="round-button" aria-label={`Add ${meal.label}`} onClick={() => { setDefaultMeal(meal.id); setFormOpen(true) }}>+</button>
          </div>
          {entries.length ? <ul className="food-list">{entries.map((entry) => <li key={entry.id}>
            <div><strong>{entry.name}</strong><span>about {entry.calories.toLocaleString()} kcals</span></div>
            <div className="item-actions"><button aria-label={`Save ${entry.name} as favourite`} onClick={() => onFavourite(entry.name, entry.calories, entry.meal)}>♡</button><button aria-label={`Delete ${entry.name}`} onClick={() => onDelete(entry.id)}>×</button></div>
          </li>)}</ul> : <p className="empty-copy">{meal.empty}</p>}
        </article>
      })}
    </div>
    <button className="fab" onClick={() => setFormOpen(true)}><span>+</span> Add something edible-ish</button>
    {formOpen && <FoodForm defaultMeal={defaultMeal} onClose={() => setFormOpen(false)} onSubmit={(...args) => { onAdd(...args); setFormOpen(false) }} />}
  </div>
}

function FoodForm({ defaultMeal, onClose, onSubmit }: { defaultMeal: MealSection; onClose: () => void; onSubmit: (name: string, calories: number, meal: MealSection) => void }) {
  const [name, setName] = useState('')
  const [calories, setCalories] = useState('')
  const [meal, setMeal] = useState(defaultMeal)
  const nameRef = useRef<HTMLInputElement>(null)
  useEffect(() => nameRef.current?.focus(), [])

  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">No laboratory required</span><h2 id="add-title">Add a food-ish thing</h2></div><button className="close-button" onClick={onClose} aria-label="Close">×</button></div>
      <form onSubmit={(e) => { e.preventDefault(); const kcal = Number(calories); if (name.trim() && kcal > 0) onSubmit(name, Math.round(kcal), meal) }}>
        <label>What was it?<input ref={nameRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. heroic cheese toastie" maxLength={80} required /></label>
        <label>Roughly how many kcals?<input type="number" inputMode="numeric" min="1" max="10000" step="1" value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="No need to get forensic" required /></label>
        <label>Where did it happen?<select value={meal} onChange={(e) => setMeal(e.target.value as MealSection)}>{meals.map((m) => <option value={m.id} key={m.id}>{m.label}</option>)}</select></label>
        <button className="primary-button" type="submit">Log the evidence</button>
      </form>
    </section>
  </div>
}

function FavouritesScreen({ favourites, onAdd, onDelete }: { favourites: FavouriteFood[]; onAdd: (f: FavouriteFood) => void; onDelete: (id: string) => void }) {
  return <div className="screen"><PageIntro eyebrow="The regulars" title="Usual suspects" copy="Tap once and it joins today. Tiny administrative miracle." />
    {favourites.length ? <div className="stack">{favourites.map((f) => <article className="favourite-card" key={f.id}>
      <button className="favourite-main" onClick={() => onAdd(f)}><span className="favourite-icon">♡</span><span><strong>{f.name}</strong><small>about {f.calories.toLocaleString()} kcals · {f.defaultMeal}</small></span><span className="add-chip">+ Add</span></button>
      <button className="delete-row" onClick={() => onDelete(f.id)}>Remove from suspects</button>
    </article>)}</div> : <EmptyState icon="♡" title="Save the usual suspects here." copy="Tap the heart beside any food on Today. It will appear here, looking organised." />}
  </div>
}

function HistoryScreen({ days, selectedDate, onSelect }: { days: Record<string, DayLog>; selectedDate: string | null; onSelect: (date: string | null) => void }) {
  const recent = useMemo(() => Object.values(days).filter((d) => d.entries.length).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30), [days])
  if (selectedDate) {
    const day = days[selectedDate]
    return <div className="screen"><button className="back-button" onClick={() => onSelect(null)}>← Recent days</button><PageIntro eyebrow="A previous episode" title={formatStoredDate(selectedDate)} copy={`${roughly(totalFor(day))} in total. Historical crumbs included.`} />
      <div className="meal-card history-detail">{day?.entries.map((entry) => <div className="history-item" key={entry.id}><div><strong>{entry.name}</strong><small>{entry.meal}</small></div><span>about {entry.calories.toLocaleString()} kcals</span></div>)}</div>
    </div>
  }
  return <div className="screen"><PageIntro eyebrow="Previously, on lunch" title="Recent history" copy="A calm archive of meals gone by. No graphs plotting against you." />
    {recent.length ? <div className="stack">{recent.map((day) => <button className="history-row" key={day.date} onClick={() => onSelect(day.date)}><span><strong>{day.date === todayKey() ? 'Today' : formatStoredDate(day.date)}</strong><small>{day.entries.length} {day.entries.length === 1 ? 'item' : 'items'} logged</small></span><span><b>{totalFor(day).toLocaleString()}</b><small>ish kcals ›</small></span></button>)}</div> : <EmptyState icon="↶" title="History is currently unwritten." copy="Log something today and the archive department will spring into action." />}
  </div>
}

function SettingsScreen({ data, onImport, onClearAll }: { data: AppData; onImport: (d: AppData) => void; onClearAll: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `easy-calories-backup-${todayKey()}.json`; anchor.click(); URL.revokeObjectURL(url)
  }
  const importData = async (file?: File) => {
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isValidImport(parsed)) throw new Error('invalid')
      if (window.confirm('Replace this notebook with the backup? Current evidence will make a quiet exit.')) onImport(parsed)
    } catch { window.alert('That file does not look like an Easy Calories backup. It may be wearing a disguise.') }
    if (inputRef.current) inputRef.current.value = ''
  }
  return <div className="screen"><PageIntro eyebrow="Notebook maintenance" title="Settings" copy="Backups, imports, and one button with commitment issues." />
    <section className="settings-card"><div className="settings-icon">↥</div><div><h3>Manual backup</h3><p>Keep your food lore somewhere safe. The file is yours; nothing leaves this device by itself.</p></div><div className="button-pair"><button className="secondary-button" onClick={exportData}>Export JSON</button><button className="secondary-button" onClick={() => inputRef.current?.click()}>Import JSON</button><input className="visually-hidden" ref={inputRef} type="file" accept="application/json,.json" onChange={(e) => importData(e.target.files?.[0])} /></div></section>
    <section className="settings-card"><div className="settings-icon">⌁</div><div><h3>Stored on this device</h3><p>No account, no cloud, no mysterious wellness empire. Safari or Chrome localStorage does the filing.</p></div></section>
    <button className="danger-button" onClick={onClearAll}>Erase all notebook data</button>
    <p className="tiny-note">Easy Calories offers rough arithmetic, not health advice. The vibes are free.</p>
  </div>
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <section className="page-intro"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{copy}</p></section>
}

function EmptyState({ icon, title, copy }: { icon: string; title: string; copy: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{copy}</p></div>
}

function formatStoredDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}

export default App
