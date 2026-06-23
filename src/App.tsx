import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FocusEvent } from 'react'
import type { AppData, DayLog, FavouriteFood, FoodLogEntry, MealSection, RecentFood } from './types'
import { emptyData, loadData, normaliseData, saveData } from './storage'
import { caloriesForGrams, estimateFoodByName, FoodLookupError, lookupFoodByBarcode } from './services/foodLookup'
import { dedupeFavourites, normaliseFoodName } from './utils/foodKey'
import { BarcodeScanner } from './BarcodeScanner'
import { createBarcodeLookupGuard, normaliseScannedBarcode } from './services/scanner'

type Screen = 'today' | 'favourites' | 'history' | 'settings'

const meals: { id: MealSection; label: string; icon: string; empty: string }[] = [
  { id: 'breakfast', label: 'Breakfast', icon: '☀️', empty: 'Nothing logged. Suspicious, but allowed.' },
  { id: 'lunch', label: 'Lunch', icon: '🥪', empty: 'Lunch is currently a mystery.' },
  { id: 'dinner', label: 'Dinner', icon: '🍝', empty: 'Dinner has not yet entered the chat.' },
  { id: 'snacks', label: 'Snacks', icon: '🍪', empty: 'No snacks logged. Bold claim.' },
]

const addedMessages = [
  'Evidence logged. The notebook grows stronger.',
  'Roughly recorded. Nobody panic.',
  'Added. Snack court is now in session.',
  'Logged with all the precision this deserves.',
  'Estimated, logged, and probably close enough.',
  'The notebook accepts this version of events.',
  'Added. The maths department is coping.',
]

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
const totalFor = (day?: DayLog) => day?.entries.reduce((sum, item) => sum + item.calories, 0) ?? 0
const roughly = (value: number) => `roughly ${value.toLocaleString()} kcals`
const formatGrams = (value: number) => Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 })
const formatMultiplier = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })
const recentKey = (name: string, calories: number) => `${normaliseFoodName(name)}|${Math.round(calories / 10) * 10}`
const upsertFavourite = (favourites: FavouriteFood[], next: FavouriteFood) => [next, ...favourites.filter((food) => normaliseFoodName(food.name) !== normaliseFoodName(next.name))]

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
  const [lastLogged, setLastLogged] = useState<FoodLogEntry | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<FavouriteFood | null>(null)

  useEffect(() => saveData(data), [data])
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!lastLogged) return
    const key = recentKey(lastLogged.name, lastLogged.calories)
    const appearances = Object.values(data.days).flatMap((day) => day.entries).filter((entry) => recentKey(entry.name, entry.calories) === key).length
    const alreadyFavourite = data.favourites.some((food) => normaliseFoodName(food.name) === normaliseFoodName(lastLogged.name))
    if (appearances >= 3 && !alreadyFavourite) {
      setPendingPromotion({ id: uid(), name: lastLogged.name, calories: lastLogged.calories, defaultMeal: lastLogged.meal, createdAt: lastLogged.createdAt })
    }
    setLastLogged(null)
  }, [data, lastLogged])

  const addEntry = (name: string, calories: number, meal: MealSection, saveAsFavourite = false) => {
    const date = todayKey()
    const entry: FoodLogEntry = { id: uid(), name: name.trim(), calories, meal, createdAt: new Date().toISOString() }
    setData((current) => {
      const favourite: FavouriteFood | null = saveAsFavourite
        ? { id: uid(), name: entry.name, calories, defaultMeal: meal, createdAt: entry.createdAt }
        : null
      const recent: RecentFood = { id: uid(), name: entry.name, calories, meal, lastUsedAt: entry.createdAt }
      const key = recentKey(entry.name, calories)
      return {
        ...current,
        days: {
          ...current.days,
          [date]: { date, entries: [...(current.days[date]?.entries ?? []), entry] },
        },
        favourites: favourite ? upsertFavourite(current.favourites, favourite) : current.favourites,
        recentFoods: [recent, ...current.recentFoods.filter((food) => recentKey(food.name, food.calories) !== key)].slice(0, 12),
      }
    })
    setLastLogged(entry)
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
    const exists = data.favourites.some((food) => normaliseFoodName(food.name) === normaliseFoodName(name))
    setData((current) => ({ ...current, favourites: upsertFavourite(current.favourites, favourite) }))
    setToast(exists ? 'Already suspicious. Updated the paperwork.' : 'Added to Usual Suspects.')
  }

  const toggleFavourite = (name: string, calories: number, defaultMeal: MealSection) => {
    const key = normaliseFoodName(name)
    const exists = data.favourites.some((food) => normaliseFoodName(food.name) === key)
    if (exists) {
      setData((current) => ({ ...current, favourites: current.favourites.filter((food) => normaliseFoodName(food.name) !== key) }))
      setToast(Math.random() > .5 ? 'Removed from Usual Suspects.' : 'The notebook has stopped side-eyeing this one.')
      return
    }
    const favourite: FavouriteFood = { id: uid(), name: name.trim(), calories, defaultMeal, createdAt: new Date().toISOString() }
    setData((current) => ({ ...current, favourites: upsertFavourite(current.favourites, favourite) }))
    setToast('Added to Usual Suspects.')
  }

  const today = data.days[todayKey()]

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-mark" aria-hidden="true">≈</div>
        <div><h1>Easy Calories</h1><p>The no-drama food notebook.</p></div>
      </header>

      <main>
        {screen === 'today' && <TodayScreen day={today} recentFoods={data.recentFoods} promotion={pendingPromotion} onPromote={() => {
          if (!pendingPromotion) return
          saveFavourite(pendingPromotion.name, pendingPromotion.calories, pendingPromotion.defaultMeal)
          setPendingPromotion(null)
        }} onDismissPromotion={() => setPendingPromotion(null)} onRecentAdd={(food) => {
          addEntry(food.name, food.calories, food.meal)
          setToast('The notebook remembers. Slightly worrying, but useful.')
        }} onAdd={addEntry} onToast={setToast} favourites={data.favourites} onDelete={removeEntry} onToggleFavourite={toggleFavourite} onClear={() => {
          if (window.confirm('Clear today’s evidence? The crumbs will retain legal counsel.')) {
            const date = todayKey()
            setData((current) => ({ ...current, days: { ...current.days, [date]: { date, entries: [] } } }))
            setToast('Today cleared. A fresh and suspiciously tidy page.')
          }
        }} />}
        {screen === 'favourites' && <FavouritesScreen favourites={data.favourites} onAdd={(f) => addEntry(f.name, f.calories, f.defaultMeal)} onDelete={(name) => {
          const key = normaliseFoodName(name)
          setData((current) => ({ ...current, favourites: current.favourites.filter((f) => normaliseFoodName(f.name) !== key) }))
          setToast('Favourite removed. It knows what it did.')
        }} />}
        {screen === 'history' && <HistoryScreen days={data.days} selectedDate={selectedDate} onSelect={setSelectedDate} onUseAgain={(entry) => {
          addEntry(entry.name, entry.calories, entry.meal)
          setToast(Math.random() > .5 ? 'Reheated the paperwork.' : 'Added again. History repeats itself, but snackier.')
        }} />}
        {screen === 'settings' && <SettingsScreen data={data} onImport={(next) => { setData(next); setToast('Backup restored. Past-you came prepared.') }} onClearAll={() => {
          if (window.confirm('Erase absolutely everything? This is the big red-ish button, minus the judgement.')) {
            setData(emptyData()); setToast('All data cleared. The notebook has amnesia.')
          }
        }} />}
      </main>

      {toast && <div className="toast" role="status">{toast}</div>}
      <nav className="bottom-nav" aria-label="Main navigation">
        {([
          ['today', '⌂', 'Today'], ['favourites', '♡', 'Favourites'], ['history', 'clock', 'History'], ['settings', '⚙', 'Settings'],
        ] as [Screen, string, string][]).map(([id, icon, label]) => (
          <button key={id} className={screen === id ? 'active' : ''} onClick={() => { setScreen(id); setSelectedDate(null) }} aria-current={screen === id ? 'page' : undefined}>
            <span aria-hidden="true">{icon === 'clock' ? <ClockIcon /> : icon}</span>{label}
          </button>
        ))}
      </nav>
    </div>
  )
}

function TodayScreen({ day, recentFoods, favourites, promotion, onPromote, onDismissPromotion, onRecentAdd, onAdd, onToast, onDelete, onToggleFavourite, onClear }: {
  day?: DayLog
  recentFoods: RecentFood[]
  favourites: FavouriteFood[]
  promotion: FavouriteFood | null
  onPromote: () => void
  onDismissPromotion: () => void
  onRecentAdd: (food: RecentFood) => void
  onAdd: (name: string, calories: number, meal: MealSection, saveAsFavourite?: boolean) => void
  onToast: (message: string) => void
  onDelete: (id: string) => void
  onToggleFavourite: (name: string, calories: number, meal: MealSection) => void
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

    {promotion && <aside className="promotion-card"><div><strong>This one keeps turning up.</strong><p>Promote {promotion.name} to Usual Suspect?</p></div><div><button className="promotion-yes" onClick={onPromote}>Yes, make it suspicious</button><button onClick={onDismissPromotion}>Not now</button></div></aside>}

    <section className="recents-section">
      <div className="recents-heading"><div><span className="eyebrow">Recently accused</span><h2>Quick returners</h2></div><p>Tap one and it joins today. Due process optional.</p></div>
      {recentFoods.length ? <div className="recent-strip">{recentFoods.map((food) => {
        const meal = meals.find((item) => item.id === food.meal)
        return <button className="recent-chip" key={food.id} onClick={() => onRecentAdd(food)}><span aria-hidden="true">{meal?.icon}</span><strong>{food.name}</strong><small>{roughly(food.calories)}</small></button>
      })}</div> : <p className="recent-empty">Log something once and it may return here, like a tiny edible boomerang.</p>}
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
          {entries.length ? <ul className="food-list">{entries.map((entry) => {
            const isFavourite = favourites.some((food) => normaliseFoodName(food.name) === normaliseFoodName(entry.name))
            return <li key={entry.id}>
            <div><strong>{entry.name}</strong><span>about {entry.calories.toLocaleString()} kcals</span></div>
            <div className="item-actions"><button className={`heart-button ${isFavourite ? 'active' : ''}`} aria-label={isFavourite ? `Remove ${entry.name} from favourites` : `Save ${entry.name} as favourite`} aria-pressed={isFavourite} onClick={() => onToggleFavourite(entry.name, entry.calories, entry.meal)}>{isFavourite ? '♥' : '♡'}</button><button aria-label={`Delete ${entry.name}`} onClick={() => onDelete(entry.id)}>×</button></div>
          </li>})}</ul> : <p className="empty-copy">{meal.empty}</p>}
        </article>
      })}
    </div>
    <button className="fab" onClick={() => setFormOpen(true)}><span>+</span> Add something edible-ish</button>
    {formOpen && <FoodForm defaultMeal={defaultMeal} onClose={() => setFormOpen(false)} onToast={onToast} onSubmit={(...args) => { onAdd(...args); setFormOpen(false) }} />}
  </div>
}

function FoodForm({ defaultMeal, onClose, onToast, onSubmit }: { defaultMeal: MealSection; onClose: () => void; onToast: (message: string) => void; onSubmit: (name: string, calories: number, meal: MealSection, saveAsFavourite: boolean) => void }) {
  const [mode, setMode] = useState<'name' | 'barcode'>('name')
  const [name, setName] = useState('')
  const [barcode, setBarcode] = useState('')
  const [calories, setCalories] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [customQuantity, setCustomQuantity] = useState('1')
  const [allowFractionalQuantity, setAllowFractionalQuantity] = useState(false)
  const [customQuantityOpen, setCustomQuantityOpen] = useState(false)
  const [unitCalories, setUnitCalories] = useState<number | null>(null)
  const [barcodeAmount, setBarcodeAmount] = useState<{ kcalPer100g: number; packSizeGrams: number | null } | null>(null)
  const [grams, setGrams] = useState('')
  const [meal, setMeal] = useState(defaultMeal)
  const [saveAsFavourite, setSaveAsFavourite] = useState(false)
  const [lookupMessage, setLookupMessage] = useState<{ tone: 'success' | 'error' | 'loading'; text: string } | null>(null)
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [evidenceBarcode, setEvidenceBarcode] = useState('')
  const [visualViewport, setVisualViewport] = useState({ height: 0, offsetTop: 0 })
  const nameRef = useRef<HTMLInputElement>(null)
  const displayNameRef = useRef<HTMLInputElement>(null)
  const barcodeGuard = useMemo(() => createBarcodeLookupGuard(), [])
  const appliedBarcodeRef = useRef('')
  const nameEditVersionRef = useRef(0)
  useEffect(() => nameRef.current?.focus(), [])

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const updateViewport = () => setVisualViewport({ height: viewport.height, offsetTop: viewport.offsetTop })
    updateViewport()
    viewport.addEventListener('resize', updateViewport)
    viewport.addEventListener('scroll', updateViewport)
    return () => {
      viewport.removeEventListener('resize', updateViewport)
      viewport.removeEventListener('scroll', updateViewport)
    }
  }, [])

  const backdropStyle: CSSProperties | undefined = visualViewport.height
    ? { height: visualViewport.height, top: visualViewport.offsetTop, bottom: 'auto' }
    : undefined
  const keepFocusedControlVisible = (event: FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
    const target = event.currentTarget
    window.setTimeout(() => target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 180)
  }
  const gramOptions = useMemo(() => {
    const options = [{ label: '50g', grams: 50 }, { label: '100g', grams: 100 }]
    if (barcodeAmount?.packSizeGrams) {
      options.push(
        { label: `Half pack ${formatGrams(barcodeAmount.packSizeGrams / 2)}g`, grams: barcodeAmount.packSizeGrams / 2 },
        { label: `Whole pack ${formatGrams(barcodeAmount.packSizeGrams)}g`, grams: barcodeAmount.packSizeGrams },
      )
    }
    return options.filter((option, index) => options.findIndex((candidate) => candidate.grams === option.grams) === index)
  }, [barcodeAmount])

  const estimateByName = async () => {
    if (!name.trim()) return
    setIsLookingUp(true)
    setLookupMessage(null)
    const estimate = await estimateFoodByName(name)
    setIsLookingUp(false)
    if (!estimate) {
      setLookupMessage({ tone: 'error', text: 'The snack oracle has not heard of this one. Which is rude.' })
      return
    }
    const estimatedQuantity = estimate.quantity ?? 1
    const each = estimate.unitCalories ?? Math.round(estimate.calories / estimatedQuantity)
    setQuantity(estimatedQuantity)
    setCustomQuantity(String(estimatedQuantity))
    setAllowFractionalQuantity(true)
    setCustomQuantityOpen(![0.5, 1, 2, 3, 4].includes(estimatedQuantity))
    setUnitCalories(each)
    setCalories(String(estimate.calories))
    const estimateCopy = estimatedQuantity === 0.5
      ? `That looks like half. Roughly ${estimate.calories.toLocaleString()} kcals.`
      : estimatedQuantity !== 1
        ? `${formatMultiplier(estimatedQuantity)} portions. Roughly ${each.toLocaleString()} each, so ${estimate.calories.toLocaleString()} kcals total.`
      : `I reckon this is roughly ${estimate.calories.toLocaleString()} kcals.`
    setLookupMessage({ tone: 'success', text: `${estimateCopy}${estimate.note ? ` ${estimate.note}` : ''}` })
  }

  const updateBarcode = (nextBarcode: string, forceClear = false) => {
    const cleanBarcode = normaliseScannedBarcode(nextBarcode)
    const stillShowingSameProduct = !forceClear && cleanBarcode !== '' && cleanBarcode === appliedBarcodeRef.current
    barcodeGuard.updateBarcode(cleanBarcode)
    setBarcode(nextBarcode)
    if (stillShowingSameProduct) return

    appliedBarcodeRef.current = ''
    nameEditVersionRef.current += 1
    setEvidenceBarcode('')
    setName('')
    setCalories('')
    setQuantity(1)
    setCustomQuantity('1')
    setAllowFractionalQuantity(false)
    setCustomQuantityOpen(false)
    setUnitCalories(null)
    setBarcodeAmount(null)
    setGrams('')
    setLookupMessage(null)
    setIsLookingUp(false)
  }

  const estimateByBarcode = async (barcodeValue = barcode) => {
    const cleanBarcode = normaliseScannedBarcode(barcodeValue)
    if (!cleanBarcode) return
    const ticket = barcodeGuard.begin(cleanBarcode)
    const nameEditVersionAtStart = nameEditVersionRef.current
    appliedBarcodeRef.current = ''
    setEvidenceBarcode(cleanBarcode)
    setIsLookingUp(true)
    setLookupMessage({ tone: 'loading', text: `Interrogating barcode ${cleanBarcode}...` })
    if (import.meta.env.DEV) console.debug('[Easy Calories] barcode sent to lookup', cleanBarcode)
    try {
      const estimate = await lookupFoodByBarcode(cleanBarcode)
      if (!barcodeGuard.isCurrent(ticket)) {
        if (import.meta.env.DEV) console.debug('[Easy Calories] stale barcode response discarded', cleanBarcode)
        return
      }
      if (!estimate) {
        setLookupMessage({ tone: 'error', text: 'Barcode caught, product unknown. The tin remains mysterious.' })
        return
      }
      if (nameEditVersionRef.current === nameEditVersionAtStart) setName(estimate.name)
      setQuantity(1)
      setCustomQuantity('1')
      setAllowFractionalQuantity(false)
      setCustomQuantityOpen(false)
      if (estimate.calculationMode === 'per100g' && estimate.kcalPer100g && estimate.grams) {
        setBarcodeAmount({ kcalPer100g: estimate.kcalPer100g, packSizeGrams: estimate.packSizeGrams ?? null })
        setGrams(String(estimate.grams))
        setUnitCalories(null)
      } else {
        setBarcodeAmount(null)
        setGrams('')
        setUnitCalories(estimate.unitCalories ?? estimate.calories)
      }
      setCalories(String(estimate.calories))
      appliedBarcodeRef.current = cleanBarcode
      const resultCopy = estimate.name.trim()
        ? `Open Food Facts reckons this is ${estimate.name}. The notebook accepts corrections.`
        : 'Found the calories. The name tag, however, has wandered off.'
      setLookupMessage({ tone: 'success', text: `${resultCopy}${estimate.note ? ` ${estimate.note}` : ''}` })
      if (import.meta.env.DEV) console.debug('[Easy Calories] barcode result applied', { barcode: cleanBarcode, productName: estimate.productName ?? estimate.name })
    } catch (error) {
      if (!barcodeGuard.isCurrent(ticket)) {
        if (import.meta.env.DEV) console.debug('[Easy Calories] stale barcode error discarded', cleanBarcode)
        return
      }
      const text = error instanceof FoodLookupError && error.code === 'missing-calories'
        ? 'Found the product. The calories have left no forwarding address.'
        : 'The snack wires appear to be down. Manual guesswork remains undefeated.'
      setLookupMessage({ tone: 'error', text })
    } finally {
      if (barcodeGuard.isCurrent(ticket)) setIsLookingUp(false)
    }
  }

  const chooseQuantity = (nextQuantity: number) => {
    setQuantity(nextQuantity)
    setCustomQuantity(String(nextQuantity))
    if (unitCalories) {
      const total = Math.round(unitCalories * nextQuantity)
      setCalories(String(total))
      setLookupMessage({
        tone: 'success',
        text: nextQuantity !== 1
          ? `${Math.round(unitCalories).toLocaleString()} each × ${formatMultiplier(nextQuantity)} = roughly ${total.toLocaleString()} kcals. Fractions are allowed. We’re not monsters.`
          : `I reckon this is roughly ${total.toLocaleString()} kcals.`,
      })
    }
  }

  const enterCustomQuantity = (value: string) => {
    setCustomQuantity(value)
    const nextQuantity = Number(value)
    if (!(nextQuantity > 0) || nextQuantity > 100) return
    setQuantity(nextQuantity)
    if (unitCalories) {
      const total = Math.round(unitCalories * nextQuantity)
      setCalories(String(total))
      setLookupMessage({
        tone: 'success',
        text: `${Math.round(unitCalories).toLocaleString()} each × ${formatMultiplier(nextQuantity)} = roughly ${total.toLocaleString()} kcals. The notebook has accepted this awkward truth.`,
      })
    }
  }

  const chooseGrams = (nextGrams: number | string) => {
    const value = typeof nextGrams === 'number' ? String(Math.round(nextGrams * 10) / 10) : nextGrams
    setGrams(value)
    const numericGrams = Number(value)
    if (!barcodeAmount || !(numericGrams > 0)) {
      setCalories('')
      return
    }
    setCalories(String(caloriesForGrams(barcodeAmount.kcalPer100g, numericGrams)))
  }

  return <div className="modal-backdrop" style={backdropStyle} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div className="sheet-handle" />
      <div className="sheet-heading"><div><span className="eyebrow">No laboratory required</span><h2 id="add-title">Add a food-ish thing</h2></div><button className="close-button" onClick={onClose} aria-label="Close">×</button></div>
      <div className="lookup-tabs" role="tablist" aria-label="Food lookup method">
        <button type="button" role="tab" aria-selected={mode === 'name'} className={mode === 'name' ? 'active' : ''} onClick={() => { setScannerOpen(false); barcodeGuard.updateBarcode(barcode); setIsLookingUp(false); setMode('name'); setLookupMessage(null) }}>By name</button>
        <button type="button" role="tab" aria-selected={mode === 'barcode'} className={mode === 'barcode' ? 'active' : ''} onClick={() => { setScannerOpen(false); setMode('barcode'); setLookupMessage(null) }}>By barcode</button>
      </div>
      <form noValidate onSubmit={(e) => {
        e.preventDefault()
        if (isLookingUp) return
        const submittedName = mode === 'barcode' ? displayNameRef.current?.value ?? name : name
        if (!submittedName.trim()) {
          setLookupMessage({ tone: 'error', text: 'The evidence needs a name. Even snacks need paperwork.' })
          return
        }
        const kcal = Number(calories)
        if (!(kcal > 0)) {
          setLookupMessage({ tone: 'error', text: 'The calorie box needs a heroic-ish number before we file this.' })
          return
        }
        onSubmit(submittedName, Math.round(kcal), meal, saveAsFavourite)
      }}>
        {mode === 'name' ? <>
          <label>What was it?<input ref={nameRef} value={name} onFocus={keepFocusedControlVisible} onChange={(e) => { setName(e.target.value); setLookupMessage(null); setCalories(''); setQuantity(1); setCustomQuantity('1'); setAllowFractionalQuantity(false); setCustomQuantityOpen(false); setUnitCalories(null); setBarcodeAmount(null); setGrams('') }} placeholder="e.g. two heroic cheese toasties" maxLength={80} required /></label>
          <button className="estimate-button" type="button" disabled={!name.trim() || isLookingUp} onClick={estimateByName}>{isLookingUp ? 'Consulting the oracle…' : 'Guess the damage'}</button>
        </> : <>
          {scannerOpen && <BarcodeScanner onCancel={() => setScannerOpen(false)} onDetected={(scannedBarcode) => {
            setScannerOpen(false)
            updateBarcode(scannedBarcode, true)
            onToast([
              'Barcode caught. It put up a brave fight.',
              'Found it. The packet has confessed.',
              'Scanned. The evidence is admissible-ish.',
            ][Math.floor(Math.random() * 3)])
            void estimateByBarcode(scannedBarcode)
          }} />}
          <label>Barcode number<input value={barcode} onFocus={keepFocusedControlVisible} onChange={(e) => updateBarcode(e.target.value.replace(/[^0-9 ]/g, ''))} placeholder="Type or paste the tiny number" inputMode="numeric" maxLength={18} /></label>
          {!scannerOpen && <button className="scan-button" type="button" onClick={() => { setLookupMessage(null); setScannerOpen(true) }}><span aria-hidden="true">▣</span> Scan the evidence</button>}
          <button className="estimate-button" type="button" disabled={!barcode.trim() || isLookingUp} onClick={() => void estimateByBarcode()}>{isLookingUp ? 'Rummaging in the tins…' : 'Ask the snack oracle'}</button>
          {(barcode.trim() || evidenceBarcode || name) && <label>What shall we call it?<input ref={displayNameRef} value={name} onFocus={keepFocusedControlVisible} onChange={(e) => { nameEditVersionRef.current += 1; setName(e.target.value) }} placeholder="What shall we call this mysterious packet?" maxLength={80} /></label>}
          {evidenceBarcode && <p className="barcode-evidence">Looked up from barcode {evidenceBarcode}</p>}
        </>}
        {lookupMessage && <div className={`lookup-message ${lookupMessage.tone}`} role="status">{lookupMessage.text}</div>}
        {barcodeAmount && <section className="amount-picker" aria-label="Packaged food amount">
          <div><strong>How much made an appearance?</strong><small>{Math.round(barcodeAmount.kcalPer100g).toLocaleString()} kcals per 100g</small></div>
          <div className="amount-options">{gramOptions.map((option) => <button type="button" key={option.label} className={Number(grams) === option.grams ? 'active' : ''} onClick={() => chooseGrams(option.grams)}>{option.label}</button>)}</div>
          <label>Amount eaten<div className="unit-input"><input aria-label="Amount eaten" type="number" inputMode="decimal" min="0.1" max="10000" step="0.1" value={grams} onFocus={keepFocusedControlVisible} onChange={(e) => chooseGrams(e.target.value)} /><span>g</span></div></label>
          {Number(grams) > 0 && <p>{Math.round(barcodeAmount.kcalPer100g).toLocaleString()} per 100g × {formatGrams(Number(grams))}g = roughly {caloriesForGrams(barcodeAmount.kcalPer100g, Number(grams)).toLocaleString()} kcals</p>}
        </section>}
        {unitCalories && <div className="quantity-picker"><div><strong>How many made an appearance?</strong><small>{Math.round(unitCalories).toLocaleString()} each × {formatMultiplier(quantity)} = roughly {Math.round(unitCalories * quantity).toLocaleString()} kcals</small></div><div className={`quantity-options${allowFractionalQuantity ? ' fractional' : ''}`} aria-label="Item quantity">{(allowFractionalQuantity ? [0.5, 1, 2, 3, 4] : [1, 2, 3, 4]).map((number) => <button type="button" key={number} className={quantity === number ? 'active' : ''} aria-pressed={quantity === number} onClick={() => chooseQuantity(number)}>{number === 0.5 ? '½' : number}</button>)}</div>{allowFractionalQuantity && <div className="custom-quantity"><button className="text-button" type="button" onClick={() => setCustomQuantityOpen((open) => !open)}>Need stranger maths?</button>{customQuantityOpen && <label>Portions<small>Snack maths accepts decimals.</small><input aria-label="Custom portions" type="number" inputMode="decimal" min="0.01" max="100" step="0.01" value={customQuantity} onFocus={keepFocusedControlVisible} onChange={(e) => enterCustomQuantity(e.target.value)} /></label>}</div>}</div>}
        <label>What shall we log it as?<small className="field-hint">{calories ? 'The app has had a guess. Editing is entirely legal.' : 'Optional, unless you distrust machines. Which is fair.'}</small><input type="number" inputMode="numeric" min="1" max="10000" step="1" value={calories} onFocus={keepFocusedControlVisible} onChange={(e) => setCalories(e.target.value)} placeholder={calories ? 'The app has had a guess' : 'Your heroic guess, if you have one'} required /></label>
        <label>Where did it happen?<select value={meal} onFocus={keepFocusedControlVisible} onChange={(e) => setMeal(e.target.value as MealSection)}>{meals.map((m) => <option value={m.id} key={m.id}>{m.label}</option>)}</select></label>
        <label className="usual-toggle"><input type="checkbox" checked={saveAsFavourite} onChange={(e) => setSaveAsFavourite(e.target.checked)} /><span><strong>Save as a usual suspect</strong><small>Handy for foods making repeat appearances.</small></span></label>
        <button className="primary-button" type="submit" disabled={isLookingUp}>Log the evidence</button>
      </form>
    </section>
  </div>
}

function FavouritesScreen({ favourites, onAdd, onDelete }: { favourites: FavouriteFood[]; onAdd: (f: FavouriteFood) => void; onDelete: (id: string) => void }) {
  const uniqueFavourites = useMemo(() => dedupeFavourites(favourites), [favourites])
  return <div className="screen"><PageIntro eyebrow="The regulars" title="Usual suspects" copy="Your repeat foods live here. Tap once and one joins today—tiny administrative miracle." />
    {uniqueFavourites.length ? <div className="stack">{uniqueFavourites.map((f) => <article className="favourite-card" key={normaliseFoodName(f.name)}>
      <button className="favourite-main" onClick={() => onAdd(f)}><span className="favourite-icon">♥</span><span><strong>{f.name}</strong><small>about {f.calories.toLocaleString()} kcals · {f.defaultMeal}</small></span><span className="add-chip">+ Add</span></button>
      <button className="delete-row" onClick={() => onDelete(f.name)}>Remove from suspects</button>
    </article>)}</div> : <EmptyState icon="♡" title="Save the usual suspects here." copy="Favourites are for repeat foods. Save one while logging, or tap the heart beside anything on Today." />}
  </div>
}

function HistoryScreen({ days, selectedDate, onSelect, onUseAgain }: { days: Record<string, DayLog>; selectedDate: string | null; onSelect: (date: string | null) => void; onUseAgain: (entry: FoodLogEntry) => void }) {
  const recent = useMemo(() => Object.values(days).filter((d) => d.entries.length).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30), [days])
  if (selectedDate) {
    const day = days[selectedDate]
    return <div className="screen"><button className="back-button" onClick={() => onSelect(null)}>← Recent days</button><PageIntro eyebrow="A previous episode" title={formatStoredDate(selectedDate)} copy={`${roughly(totalFor(day))} in total. Historical crumbs included.`} />
      <div className="history-groups">{meals.map((meal) => {
        const entries = day?.entries.filter((entry) => entry.meal === meal.id) ?? []
        if (!entries.length) return null
        return <section className="meal-card history-detail" key={meal.id}><h3><span aria-hidden="true">{meal.icon}</span> {meal.label}</h3>{entries.map((entry) => <div className="history-item" key={entry.id}><div><strong>{entry.name}</strong><small>about {entry.calories.toLocaleString()} kcals</small></div><button onClick={() => onUseAgain(entry)}>Use again</button></div>)}</section>
      })}</div>
    </div>
  }
  return <div className="screen"><PageIntro eyebrow="Previously, on lunch" title="Recent history" copy="A calm archive of meals gone by. No graphs plotting against you." />
    {recent.length ? <div className="stack">{recent.map((day) => <button className="history-row" key={day.date} onClick={() => onSelect(day.date)}><span><strong>{day.date === todayKey() ? 'Today' : formatStoredDate(day.date)}</strong><small>{day.entries.length} {day.entries.length === 1 ? 'item' : 'items'} logged</small></span><span><b>{totalFor(day).toLocaleString()}</b><small>ish kcals ›</small></span></button>)}</div> : <EmptyState icon="↶" title="History is currently unwritten." copy="Log something today and the archive department will spring into action." />}
  </div>
}

function SettingsScreen({ data, onImport, onClearAll }: { data: AppData; onImport: (d: AppData) => void; onClearAll: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const loggedDays = Object.values(data.days).filter((day) => day.entries.length).length
  const usualSuspects = dedupeFavourites(data.favourites).length
  const quickReturners = data.recentFoods.length
  const builtAt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(__BUILD_TIME__))
  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `easy-calories-backup-${todayKey()}.json`; anchor.click(); URL.revokeObjectURL(url)
  }
  const importData = async (file?: File) => {
    if (!file) return
    try {
      const parsed = normaliseData(JSON.parse(await file.text()))
      if (!parsed) throw new Error('invalid')
      if (window.confirm('Replace this notebook with the backup? Current evidence will make a quiet exit.')) onImport(parsed)
    } catch { window.alert('That file does not look like an Easy Calories backup. It may be wearing a disguise.') }
    if (inputRef.current) inputRef.current.value = ''
  }
  return <div className="screen"><PageIntro eyebrow="Notebook maintenance" title="Settings" copy="Backups, imports, and one button with commitment issues." />
    <section className="settings-card"><div className="settings-icon">↥</div><div><h3>Manual backup</h3><p>Keep your food lore somewhere safe. The file is yours; nothing leaves this device by itself.</p></div><div className="button-pair"><button className="secondary-button" onClick={exportData}>Export JSON</button><button className="secondary-button" onClick={() => inputRef.current?.click()}>Import JSON</button><input className="visually-hidden" ref={inputRef} type="file" accept="application/json,.json" onChange={(e) => importData(e.target.files?.[0])} /></div></section>
    <section className="settings-card"><div className="settings-icon">⌁</div><div><h3>Stored on this device</h3><p>No account, no cloud, no mysterious wellness empire. Your notebook stays in localStorage; only barcodes you choose to look up are sent to Open Food Facts.</p></div></section>
    <button className="danger-button" onClick={onClearAll}>Erase all notebook data</button>
    <section className="app-paperwork" aria-label="App version and notebook counts"><h3>App paperwork</h3><p>Easy Calories v{__APP_VERSION__}</p><p>Built: {builtAt}</p><p>Notebook contents: {loggedDays} {loggedDays === 1 ? 'day' : 'days'}, {usualSuspects} usual {usualSuspects === 1 ? 'suspect' : 'suspects'}, {quickReturners} quick {quickReturners === 1 ? 'returner' : 'returners'}.</p></section>
    <p className="tiny-note">Rough arithmetic, not health advice. The vibes are free.</p>
  </div>
}

function PageIntro({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return <section className="page-intro"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{copy}</p></section>
}

function EmptyState({ icon, title, copy }: { icon: string; title: string; copy: string }) {
  return <div className="empty-state"><span>{icon}</span><h3>{title}</h3><p>{copy}</p></div>
}

function ClockIcon() {
  return <svg className="nav-clock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>
}

function formatStoredDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(year, month - 1, day))
}

export default App
