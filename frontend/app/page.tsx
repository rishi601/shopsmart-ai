
"use client";

import { useEffect, useMemo, useState } from "react";

type Product = {
  id: number;
  name: string;
  category: string;
  price: number;
  stock: number;
  description?: string | null;
  image?: string | null;
  reason?: string;
};

type CartItem = Product & {
  quantity: number;
};

type User = { id: string; name: string; email: string; role: "ADMIN" | "CUSTOMER" };
type Address = { id: string; recipient: string; line1: string; city: string; region: string; postalCode: string; isDefault: boolean };

type Interest = "gadgets" | "fitness" | "fashion";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";
async function api<T>(path: string, token?: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.message || "Request could not be completed.");
  return result as T;
}

const productEmojis: Record<string, string> = {
  "Wireless Headphones": "🎧",
  "Smart Watch": "⌚",
  "Running Shoes": "👟",
};

const interestOptions: {
  id: Interest;
  label: string;
  emoji: string;
  description: string;
}[] = [
  {
    id: "gadgets",
    label: "Gadgets & Tech",
    emoji: "🎧",
    description: "Technology and electronic products",
  },
  {
    id: "fitness",
    label: "Fitness",
    emoji: "🏃",
    description: "Fitness tracking and active lifestyle",
  },
  {
    id: "fashion",
    label: "Fashion",
    emoji: "👟",
    description: "Style and everyday wear",
  },
];

function matchesInterest(product: Product, interest: Interest) {
  const name = product.name.toLowerCase();
  const category = product.category.toLowerCase();

  if (interest === "gadgets") {
    return (
      category === "electronics" ||
      name.includes("headphone") ||
      name.includes("watch") ||
      name.includes("gadget")
    );
  }

  if (interest === "fitness") {
    return (
      name.includes("watch") ||
      name.includes("running") ||
      name.includes("fitness") ||
      name.includes("sports") ||
      name.includes("gym")
    );
  }

  return (
    category === "fashion" ||
    name.includes("shoe") ||
    name.includes("clothing") ||
    name.includes("fashion")
  );
}

function ReviewEditor({ token, productId, productName, onSaved }: { token: string; productId: number; productName: string; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try { await api("/reviews", token, "POST", { productId, rating, body }); setDone(true); setOpen(false); onSaved(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save review."); }
  }
  return <div className="mt-2 border-t pt-2"><button onClick={() => setOpen(!open)} className="text-xs font-semibold text-indigo-700">{done ? "Review submitted" : "Rate " + productName}</button>{open && <form onSubmit={submit} className="mt-2 space-y-2"><select value={rating} onChange={(event) => setRating(Number(event.target.value))} className="rounded-lg border px-2 py-1 text-xs"><option value={5}>5 stars</option><option value={4}>4 stars</option><option value={3}>3 stars</option><option value={2}>2 stars</option><option value={1}>1 star</option></select><textarea required value={body} onChange={(event) => setBody(event.target.value)} placeholder="Share a few thoughts" rows={2} className="w-full rounded-lg border p-2 text-xs" /><button className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white">Submit review</button>{error && <p className="text-xs text-rose-700">{error}</p>}</form>}</div>;
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [recommendations, setRecommendations] = useState<Product[]>([]);
  const [trendingProducts, setTrendingProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState("desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [interest, setInterest] = useState<Interest>("gadgets");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [orders, setOrders] = useState<Array<{ id: string; status: string; total: number; createdAt: string; items: Array<{ productId: number; name: string; quantity: number }> }>>([]);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [accountOpen, setAccountOpen] = useState(false);
  const [detail, setDetail] = useState<Product | null>(null);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);
  const [frequentlyBought, setFrequentlyBought] = useState<Product[]>([]);
  const [productReviews, setProductReviews] = useState<Array<{ rating: number; title?: string; body?: string; user: { name: string } }>>([]);
  const [couponCode, setCouponCode] = useState("");
  const [selectedAddress, setSelectedAddress] = useState("");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "" });
  const [addressForm, setAddressForm] = useState({ recipient: "", line1: "", city: "", region: "", postalCode: "" });
  const [profileForm, setProfileForm] = useState({ name: "", email: "", currentPassword: "", newPassword: "" });

  async function loadCustomerData(accessToken: string) {
    const [profile, cartData, wishlistData, addressData, orderData] = await Promise.all([
      api<User>("/users/me", accessToken),
      api<{ items: Array<{ product: Product; quantity: number }> }>("/cart", accessToken),
      api<{ items: Array<{ product: Product }> }>("/wishlist", accessToken),
      api<Address[]>("/addresses", accessToken),
      api<Array<{ id: string; status: string; total: number; createdAt: string; items: Array<{ productId: number; name: string; quantity: number }> }>>("/orders", accessToken),
    ]);
    setUser(profile);
    setProfileForm({ name: profile.name, email: profile.email, currentPassword: "", newPassword: "" });
    setCart(cartData.items.map((item) => ({ ...item.product, price: Number(item.product.price), quantity: item.quantity })));
    setWishlist(wishlistData.items.map((item) => ({ ...item.product, price: Number(item.product.price) })));
    setAddresses(addressData);
    setOrders(orderData);
    if (!selectedAddress && addressData.length) setSelectedAddress(addressData.find((item) => item.isDefault)?.id ?? addressData[0].id);
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadProducts() {
      const query = new URLSearchParams({ page: String(page), limit: "9", sort: sortBy, order: sortOrder });
      if (search.trim()) query.set("q", search.trim());
      if (category !== "All") query.set("category", category);
      setLoading(true);
      try {
        const response = await fetch(`${API_BASE}/products/catalog?${query.toString()}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not load products.");
        const result: { items: Product[]; pagination: { pages: number } } = await response.json();
        setProducts(result.items.map((product) => ({ ...product, price: Number(product.price) })));
        setTotalPages(Math.max(1, result.pagination.pages));
        setError("");
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "Could not connect to the backend.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadProducts();
    return () => controller.abort();
  }, [search, category, sortBy, sortOrder, page]);

  useEffect(() => {
    api<string[]>("/products/categories").then(setCategoryOptions).catch(() => setCategoryOptions([]));
  }, []);

  
useEffect(() => {
  try {
    const savedInterest = localStorage.getItem("shopsmart-interest");
    const savedCart = localStorage.getItem("shopsmart-cart");

    if (
      savedInterest === "gadgets" ||
      savedInterest === "fitness" ||
      savedInterest === "fashion"
    ) {
      setInterest(savedInterest);
    }

    if (savedCart) {
      const parsedCart: unknown = JSON.parse(savedCart);

      if (
        Array.isArray(parsedCart) &&
        parsedCart.every(
          (item) =>
            item !== null &&
            typeof item === "object" &&
            typeof item.id === "number" &&
            typeof item.name === "string" &&
            typeof item.category === "string" &&
            typeof item.price === "number" &&
            typeof item.stock === "number"
        )
      ) {
        const restoredCart: CartItem[] = parsedCart.map(
          (item: Product & { quantity?: number }) => ({
            id: item.id,
            name: item.name,
            category: item.category,
            price: item.price,
            stock: item.stock,
            quantity:
              typeof item.quantity === "number" &&
              Number.isFinite(item.quantity)
                ? Math.min(Math.max(1, Math.floor(item.quantity)), item.stock)
                : 1,
          })
        );

        setCart(restoredCart.filter((item) => item.quantity > 0));
      }
    }
  } catch {
    console.log("Could not restore saved shopping data.");
  } finally {
    setPreferencesLoaded(true);
  }
}, []);



useEffect(() => {
  async function restoreSession() {
    const savedToken = sessionStorage.getItem("shopsmart-access-token");
    try {
      const accessToken = savedToken || (await api<{ accessToken: string }>("/auth/refresh", undefined, "POST", {})).accessToken;
      sessionStorage.setItem("shopsmart-access-token", accessToken);
      setToken(accessToken);
      await loadCustomerData(accessToken);
    } catch {
      sessionStorage.removeItem("shopsmart-access-token");
    }
  }
  void restoreSession();
}, []);

useEffect(() => {
  if (!preferencesLoaded) return;

  localStorage.setItem("shopsmart-interest", interest);
  if (token) localStorage.removeItem("shopsmart-cart");
  else localStorage.setItem("shopsmart-cart", JSON.stringify(cart));
}, [interest, cart, preferencesLoaded, token]);


  const categories = [
    "All",
    ...categoryOptions,
  ];

  const filteredRecommendations = useMemo(() => {
  const matchingRecommendations = recommendations.filter((product) =>
    matchesInterest(product, interest)
  );

  if (matchingRecommendations.length > 0) {
    return matchingRecommendations;
  }

  // Fall back to catalog products when the API has no matching recommendations.
  return products.filter((product) => matchesInterest(product, interest));
}, [recommendations, products, interest]);
  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch = product.name
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesCategory =
        category === "All" || product.category === category;

      return matchesSearch && matchesCategory;
    });
  }, [products, search, category]);

  useEffect(() => {
    const route = token ? "/recommendations/me" : "/recommendations";
    api<{ items: Product[] }>(`${route}?interest=${interest}`, token || undefined)
      .then((result) => setRecommendations(result.items.map((item) => ({ ...item, price: Number(item.price) }))))
      .catch(() => setRecommendations([]));
  }, [interest, token]);

  useEffect(() => {
    api<Product[]>("/products/trending").then((items) => setTrendingProducts(items.map((item) => ({ ...item, price: Number(item.price) })))).catch(() => setTrendingProducts([]));
  }, []);

  useEffect(() => {
    const value = search.trim();
    if (!value) return;
    const timer = window.setTimeout(() => {
      void api("/events", token || undefined, "POST", { type: "SEARCH", query: value }).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [search, token]);

  async function addToCart(product: Product) {
  if (product.stock < 1) return;

  if (token) {
    try {
      const result = await api<{ items: Array<{ product: Product; quantity: number }> }>("/cart/items", token, "POST", { productId: product.id, quantity: 1 });
      setCart(result.items.map((item) => ({ ...item.product, price: Number(item.product.price), quantity: item.quantity })));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add this product.");
    }
    return;
  }

  setCart((current) => {
    const existing = current.find((item) => item.id === product.id);

    if (existing) {
      if (existing.quantity >= product.stock) {
        return current;
      }

      return current.map((item) =>
        item.id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      );
    }

    return [...current, { ...product, quantity: 1 }];
  });
}

  async function updateCartItem(item: CartItem, quantity: number) {
    if (token) {
      try {
        const result = await api<{ items: Array<{ product: Product; quantity: number }> }>(`/cart/items/${item.id}`, token, "PATCH", { quantity });
        setCart(result.items.map((row) => ({ ...row.product, price: Number(row.product.price), quantity: row.quantity })));
      } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update cart."); }
      return;
    }
    setCart((current) => quantity <= 0
      ? current.filter((entry) => entry.id !== item.id)
      : current.map((entry) => entry.id === item.id ? { ...entry, quantity: Math.min(entry.stock, quantity) } : entry));
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const guestCart = cart;
    setBusy(true);
    try {
      const result = await api<{ accessToken: string; user: User }>(`/auth/${authMode}`, undefined, "POST", authMode === "register" ? authForm : { email: authForm.email, password: authForm.password });
      sessionStorage.setItem("shopsmart-access-token", result.accessToken);
      setToken(result.accessToken);
      setUser(result.user);
      setAuthOpen(false);
      await loadCustomerData(result.accessToken);
      if (guestCart.length > 0) {
        for (const item of guestCart) await api("/cart/items", result.accessToken, "POST", { productId: item.id, quantity: item.quantity });
        await loadCustomerData(result.accessToken);
      }
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Sign in failed."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    try { await api("/auth/logout", token, "POST", {}); } catch { /* local sign-out remains available */ }
    sessionStorage.removeItem("shopsmart-access-token");
    setToken(""); setUser(null); setWishlist([]); setOrders([]); setAddresses([]); setAccountOpen(false);
  }

  async function updateProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const updated = await api<User>("/users/me", token, "PATCH", profileForm);
      setUser(updated);
      setProfileForm((current) => ({ ...current, currentPassword: "", newPassword: "" }));
      setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update your profile."); }
  }

  async function toggleWishlist(product: Product) {
    if (!token) { setAuthOpen(true); setError("Sign in to save products to your wishlist."); return; }
    const saved = wishlist.some((item) => item.id === product.id);
    try {
      const result = saved
        ? await api<{ items: Array<{ product: Product }> }>(`/wishlist/items/${product.id}`, token, "DELETE")
        : await api<{ items: Array<{ product: Product }> }>("/wishlist/items", token, "POST", { productId: product.id });
      setWishlist(result.items.map(({ product: item }) => ({ ...item, price: Number(item.price) })));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update wishlist."); }
  }

  async function showDetails(product: Product) {
    try {
      const result = await api<Product>(`/products/${product.id}`);
      setDetail({ ...result, price: Number(result.price) });
      const similar = await api<Product[]>(`/products/${product.id}/similar`).catch(() => []);
      setSimilarProducts(similar.map((item) => ({ ...item, price: Number(item.price) })));
      const together = await api<Product[]>(`/products/${product.id}/frequently-bought-together`).catch(() => []);
      setFrequentlyBought(together.map((item) => ({ ...item, price: Number(item.price) })));
      const reviews = await api<Array<{ rating: number; title?: string; body?: string; user: { name: string } }>>(`/products/${product.id}/reviews`).catch(() => []);
      setProductReviews(reviews);
      if (token) void api("/events", token, "POST", { type: "VIEW", productId: product.id }).catch(() => undefined);
    } catch { setDetail(product); setSimilarProducts([]); setFrequentlyBought([]); setProductReviews([]); }
  }

  async function saveAddress(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const address = await api<Address>("/addresses", token, "POST", addressForm);
      setAddresses((current) => [...current, address]); setSelectedAddress(address.id);
      setAddressForm({ recipient: "", line1: "", city: "", region: "", postalCode: "" });
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save address."); }
  }

  async function checkout() {
    if (!token) { setAuthOpen(true); setError("Sign in to complete checkout."); return; }
    if (!selectedAddress) { setError("Add or select a delivery address first."); return; }
    setBusy(true);
    try {
      const order = await api<{ id: string }>("/orders", token, "POST", { addressId: selectedAddress, couponCode: couponCode || undefined });
      const payment = await api<{ keyId: string; providerOrderId: string; amount: number; currency: string }>(`/payments/orders/${order.id}`, token, "POST", {});
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => {
        if (!window.Razorpay) { setError("Payment checkout could not be loaded."); setBusy(false); return; }
        const checkoutUi = new window.Razorpay({
          key: payment.keyId, order_id: payment.providerOrderId, amount: payment.amount, currency: payment.currency,
          name: "ShopSmart AI", description: `Order ${order.id}`,
          handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              await api("/payments/verify", token, "POST", { orderId: order.id, ...response });
              setCart([]); localStorage.removeItem("shopsmart-cart"); await loadCustomerData(token);
            } catch (reason) { setError(reason instanceof Error ? reason.message : "Payment verification failed."); }
            finally { setBusy(false); }
          },
          modal: { ondismiss: () => setBusy(false) },
        });
        checkoutUi.open();
      };
      script.onerror = () => { setError("Payment checkout could not be loaded."); setBusy(false); };
      document.body.appendChild(script);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Checkout could not be started."); setBusy(false); }
  }

  const cartTotal = cart.reduce(
  (sum, item) => sum + item.price * item.quantity,
  0
);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-10 border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <a href="#" className="text-2xl font-extrabold tracking-tight">
            ShopSmart<span className="text-blue-600"> AI</span>
          </a>

          <div className="flex items-center gap-3 text-sm font-semibold">
            {user?.role === "ADMIN" && <a href="/admin" className="rounded-lg bg-indigo-50 px-3 py-2 text-indigo-700">Admin</a>}
            {user ? <button onClick={() => setAccountOpen(!accountOpen)} className="rounded-lg border px-3 py-2">{user.name.split(" ")[0]}</button> : <button onClick={() => { setAuthMode("login"); setAuthOpen(true); }} className="rounded-lg border px-3 py-2">Sign in</button>}
            <button onClick={() => setAccountOpen(!accountOpen)} className="rounded-lg border px-3 py-2" aria-label="Open account and wishlist">♡{wishlist.length ? ` ${wishlist.length}` : ""}</button>
            🛒 Cart: {cart.reduce((sum, item) => sum + item.quantity, 0)} item{cart.reduce((sum, item) => sum + item.quantity, 0) === 1 ? "" : "s"}
            <span className="ml-2 text-blue-700">
              ₹{cartTotal.toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </header>

      {accountOpen && (
        <section className="fixed right-4 top-20 z-40 w-[min(92vw,440px)] rounded-2xl border bg-white p-5 shadow-xl">
          <div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">{user ? `Hi, ${user.name}` : "Your account"}</h2><button onClick={() => setAccountOpen(false)} aria-label="Close account panel">×</button></div>
          {user ? <>
            <p className="mt-1 text-sm text-slate-500">{user.email}</p>
            <details className="mt-3 rounded-xl border p-3"><summary className="cursor-pointer text-sm font-bold">Edit profile</summary><form onSubmit={updateProfile} className="mt-3 space-y-2"><input required minLength={2} value={profileForm.name} onChange={(event) => setProfileForm({ ...profileForm, name: event.target.value })} placeholder="Name" className="w-full rounded-lg border px-3 py-2 text-sm" /><input required type="email" value={profileForm.email} onChange={(event) => setProfileForm({ ...profileForm, email: event.target.value })} placeholder="Email" className="w-full rounded-lg border px-3 py-2 text-sm" /><input type="password" value={profileForm.currentPassword} onChange={(event) => setProfileForm({ ...profileForm, currentPassword: event.target.value })} placeholder="Current password (required for email/password changes)" className="w-full rounded-lg border px-3 py-2 text-sm" /><input type="password" minLength={10} value={profileForm.newPassword} onChange={(event) => setProfileForm({ ...profileForm, newPassword: event.target.value })} placeholder="New password (optional)" className="w-full rounded-lg border px-3 py-2 text-sm" /><button className="w-full rounded-lg bg-slate-900 py-2 text-sm font-bold text-white">Save profile</button></form></details>
            <h3 className="mt-5 font-bold">Wishlist</h3>
            <div className="mt-2 max-h-36 space-y-2 overflow-auto">{wishlist.length ? wishlist.map((product) => <div key={product.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{product.name}</span><button onClick={() => toggleWishlist(product)} className="text-red-600">Remove</button></div>) : <p className="text-sm text-slate-500">Saved products will appear here.</p>}</div>
            <h3 className="mt-5 font-bold">Recent orders</h3>
            <div className="mt-2 max-h-56 space-y-2 overflow-auto">{orders.length ? orders.slice(0, 5).map((order) => <div key={order.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between"><b>#{order.id.slice(-7)}</b><span className="text-blue-700">{order.status}</span></div><p className="mt-1 text-slate-500">₹{Number(order.total).toLocaleString("en-IN")}</p>{order.status === "DELIVERED" && order.items.map((item) => <ReviewEditor key={item.productId} token={token} productId={item.productId} productName={item.name} onSaved={() => setError("")} />)}</div>) : <p className="text-sm text-slate-500">No orders yet.</p>}</div>
            <button onClick={signOut} className="mt-4 w-full rounded-lg border py-2 text-sm font-semibold">Sign out</button>
          </> : <p className="mt-2 text-sm text-slate-500">Sign in to see your wishlist and order history.</p>}
        </section>
      )}

      {(error) && <div role="alert" className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl bg-red-50 p-4 text-sm text-red-800 shadow-lg">{error}<button className="ml-3 font-bold" onClick={() => setError("")}>×</button></div>}

      <section className="mx-auto max-w-6xl px-5 py-8">
  <h2 className="text-2xl font-extrabold">Your Shopping Cart</h2>

  {cart.length === 0 ? (
    <p className="mt-4 rounded-xl bg-white p-5 text-slate-600">
      Your cart is empty.
    </p>
  ) : (
    <div className="mt-4 space-y-3">
      {cart.map((item) => (
        <div
          key={item.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-4"
        >
          <div>
            <p className="font-bold">{item.name}</p>
            <p className="text-sm text-slate-500">
              ₹{item.price.toLocaleString("en-IN")} each
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => updateCartItem(item, item.quantity - 1)}
              className="rounded-lg border px-3 py-1"
              aria-label={`Decrease ${item.name} quantity`}
            >
              −
            </button>

            <span className="font-semibold">{item.quantity}</span>

            <button
              type="button"
              disabled={item.quantity >= item.stock}
              onClick={() => updateCartItem(item, item.quantity + 1)}
              className="rounded-lg border px-3 py-1 disabled:opacity-40"
              aria-label={`Increase ${item.name} quantity`}
            >
              +
            </button>

            <button
              type="button"
              onClick={() => updateCartItem(item, 0)}
              className="rounded-lg px-3 py-1 font-semibold text-red-600"
            >
              Remove
            </button>
          </div>

          <p className="w-full text-right font-bold">
            Subtotal: ₹
            {(item.price * item.quantity).toLocaleString("en-IN")}
          </p>
        </div>
      ))}
    </div>
  )}

  <p className="mt-5 text-right text-xl font-extrabold">
    Total: ₹{cartTotal.toLocaleString("en-IN")}
  </p>
  {cart.length > 0 && <div className="mt-6 rounded-2xl border bg-white p-5">
    {user ? <>
      <label className="block text-sm font-bold">Delivery address</label>
      {addresses.length > 0 ? <select value={selectedAddress} onChange={(event) => setSelectedAddress(event.target.value)} className="mt-2 w-full rounded-xl border px-3 py-3 text-sm">{addresses.map((address) => <option key={address.id} value={address.id}>{address.recipient} · {address.city}, {address.region}</option>)}</select> : <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Add an address to continue.</p>}
      <details className="mt-3 rounded-xl border p-3"><summary className="cursor-pointer text-sm font-bold">Add a delivery address</summary>
        <form onSubmit={saveAddress} className="mt-3 grid gap-2 sm:grid-cols-2">
          {([['recipient','Full name'],['line1','Street address'],['city','City'],['region','State'],['postalCode','Postal code']] as const).map(([key, label]) => <input key={key} required value={addressForm[key]} onChange={(event) => setAddressForm((current) => ({ ...current, [key]: event.target.value }))} placeholder={label} className="min-w-0 rounded-lg border px-3 py-2.5 text-sm" />)}
          <button className="rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white sm:col-span-2">Save address</button>
        </form>
      </details>
      <input value={couponCode} onChange={(event) => setCouponCode(event.target.value)} placeholder="Coupon code (optional)" className="mt-3 w-full rounded-xl border px-3 py-2.5 text-sm" />
      <button disabled={!addresses.length} onClick={checkout} className="mt-4 w-full rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white hover:bg-indigo-700 disabled:opacity-50">Continue to secure payment</button>
    </> : <button onClick={() => setAuthOpen(true)} className="w-full rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-3 font-bold text-indigo-800">Sign in to checkout</button>}
  </div>}
</section>

      {trendingProducts.length > 0 && <section className="mx-auto max-w-6xl px-5 pb-10">
        <div className="mb-5"><p className="text-sm font-bold uppercase tracking-wider text-blue-700">Popular right now</p><h2 className="mt-1 text-2xl font-extrabold">Trending products</h2><p className="mt-2 text-slate-600">A mix of shopper activity and fresh catalog picks.</p></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{trendingProducts.slice(0, 4).map((product) => <article key={product.id} className="rounded-2xl border bg-white p-4 shadow-sm"><p className="font-bold">{product.name}</p><p className="mt-1 text-sm text-slate-500">{product.reason}</p><div className="mt-3 flex items-center justify-between"><b className="text-blue-700">₹{Number(product.price).toLocaleString("en-IN")}</b><button onClick={() => addToCart(product)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">Add</button></div></article>)}</div>
      </section>}



      <section className="bg-gradient-to-r from-blue-950 to-indigo-700 text-white">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-blue-200">
            Smarter shopping starts here
          </p>

          <h1 className="max-w-2xl text-4xl font-extrabold leading-tight sm:text-6xl">
            Find products you will love.
          </h1>

          <p className="mt-5 max-w-xl text-base leading-7 text-blue-100 sm:text-lg">
            Discover products selected for your interests and enjoy a smarter
            shopping experience.
          </p>

          <a
            href="#products"
            className="mt-8 inline-block rounded-xl bg-white px-6 py-3 font-bold text-blue-950 hover:bg-blue-50"
          >
            Explore Products ↓
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-10">
        <p className="text-sm font-bold uppercase tracking-wider text-blue-700">
          Personalized shopping
        </p>

        <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">
          What are you interested in?
        </h2>

        <p className="mt-2 text-slate-600">
          Choose your interests to see products that match your preferences.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {interestOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setInterest(option.id)}
              aria-pressed={interest === option.id}
              className={`rounded-2xl border p-5 text-left transition ${
                interest === option.id
                  ? "border-blue-600 bg-blue-50 ring-2 ring-blue-200"
                  : "border-slate-200 bg-white hover:border-blue-300"
              }`}
            >
              <span className="text-3xl">{option.emoji}</span>

              <span className="mt-3 block font-bold">{option.label}</span>

              <span className="mt-1 block text-sm text-slate-600">
                {option.description}
              </span>

              <span className="mt-3 block text-sm font-semibold text-blue-700">
                {interest === option.id ? "✓ Selected" : "Choose interest"}
              </span>
            </button>
          ))}
        </div>

        <div className="mb-6 mt-10">
          <p className="text-sm font-bold uppercase tracking-wider text-blue-700">
            Recommended for you ✨
          </p>

          <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">
            {interestOptions.find((option) => option.id === interest)?.label}
          </h2>

          <p className="mt-2 text-slate-600">
            Products matched to your selected interest.
          </p>
        </div>

        {loading ? (
          <p className="rounded-xl bg-white p-6">Loading recommendations...</p>
        ) : error ? (
          <p className="rounded-xl bg-red-50 p-5 text-red-700">{error}</p>
        ) : filteredRecommendations.length === 0 ? (
          <p className="rounded-xl border bg-white p-6 text-slate-600">
            No matching products yet. Try another interest or add more products
            to the catalog.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredRecommendations.map((product) => (
              <div
                key={product.id}
                className="flex items-center gap-4 rounded-2xl border border-blue-100 bg-white p-5 shadow-sm"
              >
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-3xl">
                  {productEmojis[product.name] || "📦"}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="font-bold">{product.name}</p>

                  <p className="mt-1 text-sm text-slate-500">
                    {product.category}
                  </p>

                  <p className="mt-2 font-extrabold text-blue-700">
                    ₹{product.price.toLocaleString("en-IN")}
                  </p>

                  {product.reason && <p className="mt-1 text-xs text-slate-500">{product.reason}</p>}

                  <button type="button" onClick={() => showDetails(product)} className="mt-2 mr-2 text-sm font-semibold text-blue-700">Details</button>

                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={product.stock < 1}
                    className="mt-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:bg-slate-400"
                  >
                    {product.stock < 1 ? "Out of Stock" : "Add to Cart"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section id="products" className="mx-auto max-w-6xl px-5 pb-16">
        <div className="mb-6">
          <h2 className="text-2xl font-extrabold sm:text-3xl">
            Explore All Products
          </h2>

          <p className="mt-2 text-slate-600">
            Search and filter products from our catalog.
          </p>
        </div>

        <div className="mb-7 flex flex-col gap-3 sm:flex-row">
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search products..."
            className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
          />

          <select
            value={category}
            onChange={(event) => { setCategory(event.target.value); setPage(1); }}
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
          >
            {categories.map((item) => (
              <option key={item} value={item}>
                {item === "All" ? "All Categories" : item}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={(event) => { setSortBy(event.target.value); setPage(1); }}
            aria-label="Sort products by"
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:border-blue-500"
          >
            <option value="createdAt">Recently added</option>
            <option value="name">Name</option>
            <option value="price">Price</option>
          </select>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} aria-label="Sort order" className="rounded-xl border border-slate-300 bg-white px-4 py-3">
            <option value="asc">Ascending</option><option value="desc">Descending</option>
          </select>
        </div>

        {loading ? (
          <p className="rounded-xl bg-white p-8">Loading products...</p>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            <p className="font-bold">Products could not be loaded.</p>
            <p className="mt-2 text-sm">{error}</p>
          </div>
        ) : filteredProducts.length === 0 ? (
          <p className="rounded-xl bg-white p-8 text-slate-600">
            No matching products found. Try another search or category.
          </p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProducts.map((product) => (
              <article
                key={product.id}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
              >
                <div className="flex h-44 items-center justify-center bg-gradient-to-br from-slate-100 to-blue-100 text-7xl">
                  {product.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover" /> : productEmojis[product.name] || "📦"}
                </div>

                <div className="p-5">
                  <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                    {product.category}
                  </span>

                  <h3 className="mt-4 text-xl font-bold">{product.name}</h3>

                  {product.description && <p className="mt-2 line-clamp-2 text-sm text-slate-500">{product.description}</p>}

                  <button type="button" onClick={() => showDetails(product)} className="mt-2 text-sm font-semibold text-blue-700">View product details</button>

                  <p className="mt-2 text-sm text-slate-500">
                    Stock available: {product.stock}
                  </p>

                  <div className="mt-5 flex items-center justify-between gap-3">
                    <p className="text-xl font-extrabold">
                      ₹{product.price.toLocaleString("en-IN")}
                    </p>

                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={product.stock < 1}
                      className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                    >
                      {product.stock < 1 ? "Out of Stock" : "Add to Cart"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        <div className="mt-8 flex items-center justify-center gap-3">
          <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Previous</button>
          <span className="rounded-lg bg-white px-4 py-2 text-sm font-bold">Page {page} of {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-40">Next</button>
        </div>
      </section>

      <footer className="border-t bg-white px-5 py-6 text-center text-sm text-slate-500">
        © 2026 ShopSmart AI · Personalized E-Commerce Recommendations
      </footer>

      {authOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setAuthOpen(false); }}>
        <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
          <div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">{authMode === "login" ? "Welcome back" : "Join ShopSmart"}</p><h2 className="mt-1 text-2xl font-extrabold">{authMode === "login" ? "Sign in" : "Create your account"}</h2></div><button onClick={() => setAuthOpen(false)} className="text-2xl">×</button></div>
          <form onSubmit={submitAuth} className="mt-5 space-y-3">
            {authMode === "register" && <input required minLength={2} value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} placeholder="Full name" className="w-full rounded-xl border px-4 py-3" />}
            <input required type="email" autoComplete="email" value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} placeholder="Email address" className="w-full rounded-xl border px-4 py-3" />
            <input required minLength={10} type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} placeholder="Password (10 characters minimum)" className="w-full rounded-xl border px-4 py-3" />
            <button disabled={busy} className="w-full rounded-xl bg-slate-950 py-3 font-bold text-white disabled:opacity-50">{busy ? "Please wait…" : authMode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <button onClick={() => setAuthMode(authMode === "login" ? "register" : "login")} className="mt-4 w-full text-sm font-semibold text-slate-500">{authMode === "login" ? "New here? Create an account" : "Already registered? Sign in"}</button>
        </section>
      </div>}

      {detail && <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}><section className="grid max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white sm:grid-cols-2"><div className="flex min-h-64 items-center justify-center bg-slate-100 text-7xl">{detail.image ? <img src={detail.image} alt={detail.name} className="h-full max-h-[70vh] w-full object-cover" /> : productEmojis[detail.name] || "📦"}</div><div className="p-6"><div className="flex justify-between"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{detail.category}</span><button onClick={() => setDetail(null)} className="text-2xl">×</button></div><h2 className="mt-5 text-2xl font-extrabold">{detail.name}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{detail.description || "A product selected for the ShopSmart collection."}</p><p className="mt-5 text-2xl font-extrabold">₹{Number(detail.price).toLocaleString("en-IN")}</p><p className="mt-1 text-sm text-slate-500">{detail.stock > 0 ? `${detail.stock} in stock` : "Out of stock"}</p><div className="mt-6 flex gap-2"><button disabled={detail.stock < 1} onClick={() => addToCart(detail)} className="flex-1 rounded-xl bg-blue-600 py-3 font-bold text-white disabled:opacity-40">Add to cart</button><button onClick={() => toggleWishlist(detail)} className="rounded-xl border px-4 text-lg" aria-label="Save to wishlist">{wishlist.some((item) => item.id === detail.id) ? "♥" : "♡"}</button></div>{similarProducts.length > 0 && <div className="mt-6 border-t pt-4"><p className="text-sm font-bold">Similar products</p><div className="mt-2 space-y-2">{similarProducts.slice(0,3).map((item) => <button key={item.id} onClick={() => showDetails(item)} className="flex w-full justify-between rounded-lg bg-slate-50 p-2 text-left text-sm"><span>{item.name}</span><b>₹{Number(item.price).toLocaleString("en-IN")}</b></button>)}</div></div>}{frequentlyBought.length > 0 && <div className="mt-5 border-t pt-4"><p className="text-sm font-bold">Frequently bought together</p><div className="mt-2 space-y-2">{frequentlyBought.slice(0,3).map((item) => <button key={item.id} onClick={() => showDetails(item)} className="flex w-full justify-between rounded-lg bg-slate-50 p-2 text-left text-sm"><span>{item.name}</span><b>₹{Number(item.price).toLocaleString("en-IN")}</b></button>)}</div></div>}</div></section></div>}
    </main>
  );
}
