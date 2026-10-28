"use client";

import { FormEvent, useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3003";
type Product = { id: number; name: string; category: string; price: number; stock: number; description?: string | null; image?: string | null; active: boolean; brand?: { name: string } | null };
type Order = { id: string; status: string; total: number; createdAt: string; user: { name: string; email: string }; items: Array<{ name: string; quantity: number }> };
type Review = { id: string; rating: number; title?: string; body?: string; approved: boolean; user: { name: string }; product: { name: string } };
type Customer = { id: string; name: string; email: string; active: boolean; _count: { orders: number } };
type Dashboard = { orders: number; customers: number; products: number; revenue: number; lowStock: Product[] };
type SalesReport = { byStatus: Array<{ status: string; _count: { _all: number }; _sum: { total: number | null } }>; paidPayments: { amount: number; count: number }; ordersByDay: Array<{ day: string; orders: number; revenue: number }> };
type Tab = "overview" | "products" | "orders" | "customers" | "reviews" | "catalog";

async function api<T>(path: string, token: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch(API + path, { method, headers: { Authorization: "Bearer " + token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new Error(value?.message || "Request failed.");
  return value as T;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [sales, setSales] = useState<SalesReport | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [categories, setCategories] = useState<Array<{ id: number; name: string; _count: { products: number } }>>([]);
  const [brands, setBrands] = useState<Array<{ id: number; name: string; _count: { products: number } }>>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", category: "", brand: "", price: "", stock: "", description: "", image: "" });
  const [categoryName, setCategoryName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [coupon, setCoupon] = useState({ code: "", percentOff: "", amountOff: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function reload(accessToken = token) {
    const [stats, salesReport, catalog, orderRows, customerRows, reviewRows, categoryRows, brandRows] = await Promise.all([
      api<Dashboard>("/admin/dashboard", accessToken), api<SalesReport>("/admin/reports/sales", accessToken),
      api<Product[]>("/admin/products", accessToken),
      api<Order[]>("/admin/orders", accessToken), api<Customer[]>("/admin/customers", accessToken),
      api<Review[]>("/admin/reviews", accessToken), api<typeof categories>("/admin/categories", accessToken), api<typeof brands>("/admin/brands", accessToken),
    ]);
    setDashboard(stats); setSales(salesReport); setProducts(catalog); setOrders(orderRows); setCustomers(customerRows); setReviews(reviewRows); setCategories(categoryRows); setBrands(brandRows);
  }

  useEffect(() => {
    const saved = sessionStorage.getItem("shopsmart-access-token") || "";
    setToken(saved);
    if (saved) reload(saved).catch((reason: Error) => setError(reason.message));
  }, []);

  async function submitProduct(event: FormEvent) {
    event.preventDefault(); setError("");
    try {
      const payload = { ...form, price: Number(form.price), stock: Number(form.stock) };
      await api(editing ? "/admin/products/" + editing : "/admin/products", token, editing ? "PATCH" : "POST", payload);
      setNotice(editing ? "Product updated." : "Product created."); setEditing(null);
      setForm({ name: "", category: "", brand: "", price: "", stock: "", description: "", image: "" }); await reload();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save product."); }
  }

  async function createCategory(event: FormEvent) {
    event.preventDefault();
    try { await api("/admin/categories", token, "POST", { name: categoryName }); setCategoryName(""); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create category."); }
  }
  async function createBrand(event: FormEvent) {
    event.preventDefault();
    try { await api("/admin/brands", token, "POST", { name: brandName }); setBrandName(""); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create brand."); }
  }
  async function createCoupon(event: FormEvent) {
    event.preventDefault();
    try {
      const payload = { code: coupon.code, ...(coupon.percentOff ? { percentOff: Number(coupon.percentOff) } : { amountOff: Number(coupon.amountOff) }) };
      await api("/admin/coupons", token, "POST", payload); setCoupon({ code: "", percentOff: "", amountOff: "" }); setNotice("Coupon created.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not create coupon."); }
  }
  async function setStatus(order: Order, status: string) {
    try { await api("/admin/orders/" + order.id + "/status", token, "PATCH", { status }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update order."); }
  }
  async function moderate(review: Review, approved: boolean) {
    try { await api("/admin/reviews/" + review.id + "/moderation", token, "PATCH", { approved }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not moderate review."); }
  }
  async function activate(customer: Customer) {
    try { await api("/admin/customers/" + customer.id, token, "PATCH", { active: !customer.active }); await reload(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update customer."); }
  }

  const tabs: Array<{ id: Tab; title: string }> = [{ id: "overview", title: "Overview" }, { id: "products", title: "Products & stock" }, { id: "orders", title: "Orders" }, { id: "customers", title: "Customers" }, { id: "reviews", title: "Reviews" }, { id: "catalog", title: "Categories & offers" }];
  if (!token) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6"><section className="max-w-lg rounded-3xl bg-white p-8 text-center shadow-xl"><p className="text-xs font-black uppercase tracking-widest text-indigo-600">ShopSmart administration</p><h1 className="mt-3 text-3xl font-black">Sign in as an admin first</h1><p className="mt-3 text-slate-500">Open the storefront, sign in with an administrator account, then return to this page.</p><a href="/" className="mt-6 inline-block rounded-xl bg-slate-950 px-5 py-3 font-bold text-white">Go to storefront</a></section></main>;

  return <main className="min-h-screen bg-slate-100 text-slate-900"><header className="border-b bg-white"><div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4"><div><a href="/" className="text-sm font-bold text-indigo-700">← Storefront</a><h1 className="mt-1 text-2xl font-black">ShopSmart Admin</h1></div><button onClick={() => reload().catch((e: Error) => setError(e.message))} className="rounded-xl border px-4 py-2 text-sm font-bold">Refresh data</button></div></header>
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {(error || notice) && <div className={(error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800") + " mb-5 rounded-xl p-3 text-sm"}>{error || notice}<button className="ml-3 font-bold" onClick={() => { setError(""); setNotice(""); }}>×</button></div>}
      <nav className="flex gap-2 overflow-x-auto rounded-2xl bg-white p-2 shadow-sm">{tabs.map((item) => <button key={item.id} onClick={() => setTab(item.id)} className={(tab === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-100") + " whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold"}>{item.title}</button>)}</nav>
      {tab === "overview" && <section className="mt-6"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Revenue", "₹" + Number(dashboard?.revenue || 0).toLocaleString("en-IN")], ["Orders", dashboard?.orders ?? "—"], ["Customers", dashboard?.customers ?? "—"], ["Products", dashboard?.products ?? "—"]].map(([label,value]) => <div key={label} className="rounded-2xl bg-white p-5 shadow-sm"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 text-3xl font-black">{value}</p></div>)}</div><div className="mt-5 grid gap-5 lg:grid-cols-2"><div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Low stock alerts</h2><div className="mt-3 divide-y">{dashboard?.lowStock.length ? dashboard.lowStock.map((p) => <div key={p.id} className="flex justify-between py-3 text-sm"><span>{p.name}</span><b className="text-rose-600">{p.stock} left</b></div>) : <p className="py-3 text-sm text-slate-500">No low-stock products.</p>}</div></div><div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Sales by order status</h2><div className="mt-3 divide-y">{sales?.byStatus.map((row) => <div key={row.status} className="flex justify-between py-3 text-sm"><span>{row.status}</span><b>{row._count._all} orders · ₹{Number(row._sum.total || 0).toLocaleString("en-IN")}</b></div>)}</div><p className="mt-4 text-xs text-slate-500">Paid through payment provider: {sales?.paidPayments.count ?? 0} · ₹{Number(sales?.paidPayments.amount || 0).toLocaleString("en-IN")}</p></div></div><div className="mt-5 rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-black">Recent orders</h2><div className="mt-3 space-y-2">{orders.slice(0,6).map((o) => <div key={o.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-slate-50 p-3 text-sm"><span>#{o.id.slice(-8)} · {o.user.name}</span><span>{o.status} · ₹{Number(o.total).toLocaleString("en-IN")}</span></div>)}</div></div></section>}
      {tab === "products" && <section className="mt-6 grid gap-6 lg:grid-cols-[.8fr_1.2fr]"><form onSubmit={submitProduct} className="h-fit rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">{editing ? "Edit product" : "Add a product"}</h2><div className="mt-4 space-y-3">{([["name","Product name"],["category","Category"],["brand","Brand"],["price","Price (INR)"],["stock","Stock quantity"],["image","Image URL"],["description","Description"]] as const).map(([key,label]) => key === "description" ? <textarea key={key} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={label} rows={3} className="w-full rounded-xl border px-3 py-2.5" /> : <input key={key} required={key !== "brand" && key !== "image"} type={key === "price" || key === "stock" ? "number" : "text"} min={key === "price" || key === "stock" ? 0 : undefined} step={key === "price" ? "0.01" : undefined} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} placeholder={label} className="w-full rounded-xl border px-3 py-2.5" />)}</div><button className="mt-4 w-full rounded-xl bg-indigo-600 py-3 font-bold text-white">{editing ? "Save changes" : "Create product"}</button>{editing && <button type="button" onClick={() => { setEditing(null); setForm({ name: "", category: "", brand: "", price: "", stock: "", description: "", image: "" }); }} className="mt-2 w-full rounded-xl border py-2.5">Cancel</button>}</form><div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">Catalog and inventory</h2><div className="mt-4 space-y-2">{products.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><b>{p.name}</b><p className="text-xs text-slate-500">{p.category}{p.brand?.name ? " · " + p.brand.name : ""} · ₹{Number(p.price).toLocaleString("en-IN")} · {p.stock} in stock · {p.active ? "Active" : "Inactive"}</p></div><div className="flex gap-2"><button onClick={() => { setEditing(p.id); setForm({ name: p.name, category: p.category, brand: p.brand?.name || "", price: String(p.price), stock: String(p.stock), description: p.description || "", image: p.image || "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="rounded-lg border px-3 py-2 text-sm font-bold">Edit</button><button onClick={async () => { try { await api("/admin/products/" + p.id, token, "PATCH", { name: p.name, category: p.category, brand: p.brand?.name || "", price: Number(p.price), stock: p.stock, description: p.description || "", image: p.image || "", active: !p.active }); await reload(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not update product."); } }} className="rounded-lg border px-3 py-2 text-sm font-bold">{p.active ? "Deactivate" : "Activate"}</button></div></div>)}</div></div></section>}
      {tab === "orders" && <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">Order management</h2><div className="mt-4 space-y-3">{orders.map((o) => <article key={o.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">Order #{o.id}</p><p className="mt-1 text-sm text-slate-500">{o.user.name} · {o.user.email} · ₹{Number(o.total).toLocaleString("en-IN")}</p><p className="mt-1 text-xs text-slate-400">{o.items.map((i) => i.name + " × " + i.quantity).join(", ")}</p></div><select value={o.status} onChange={(e) => setStatus(o,e.target.value)} className="rounded-lg border px-3 py-2 text-sm"><option>PENDING</option><option>CONFIRMED</option><option>PROCESSING</option><option>SHIPPED</option><option>DELIVERED</option><option>CANCELLED</option><option>REFUNDED</option></select></div></article>)}</div></section>}
      {tab === "customers" && <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">Customer accounts</h2><div className="mt-4 space-y-2">{customers.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><b>{c.name}</b><p className="text-sm text-slate-500">{c.email} · {c._count.orders} orders · {c.active ? "Active" : "Disabled"}</p></div><button onClick={() => activate(c)} className="rounded-lg border px-3 py-2 text-sm font-bold">{c.active ? "Disable" : "Enable"}</button></div>)}</div></section>}
      {tab === "reviews" && <section className="mt-6 rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-xl font-black">Review moderation</h2><div className="mt-4 space-y-3">{reviews.map((r) => <article key={r.id} className="rounded-xl border p-4"><div className="flex flex-wrap justify-between gap-3"><div><b>{r.product.name} · {"★".repeat(r.rating)}</b><p className="text-sm text-slate-500">{r.user.name}{r.title ? " · " + r.title : ""}</p><p className="mt-2 text-sm">{r.body}</p><p className="mt-1 text-xs text-slate-400">{r.approved ? "Published" : "Pending review"}</p></div><div className="flex gap-2"><button onClick={() => moderate(r,true)} className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700">Approve</button><button onClick={() => moderate(r,false)} className="rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">Reject</button></div></div></article>)}</div></section>}
      {tab === "catalog" && <section className="mt-6 grid gap-5 lg:grid-cols-3"><div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="font-black">Categories</h2><form onSubmit={createCategory} className="mt-3 flex gap-2"><input required value={categoryName} onChange={(e) => setCategoryName(e.target.value)} placeholder="New category" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg bg-slate-950 px-3 font-bold text-white">Add</button></form><div className="mt-4 space-y-2">{categories.map((c) => <p key={c.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{c.name}</span><b>{c._count.products}</b></p>)}</div></div><div className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="font-black">Brands</h2><form onSubmit={createBrand} className="mt-3 flex gap-2"><input required value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="New brand" className="min-w-0 flex-1 rounded-lg border px-3 py-2" /><button className="rounded-lg bg-slate-950 px-3 font-bold text-white">Add</button></form><div className="mt-4 space-y-2">{brands.map((b) => <p key={b.id} className="flex justify-between rounded-lg bg-slate-50 p-3 text-sm"><span>{b.name}</span><b>{b._count.products}</b></p>)}</div></div><form onSubmit={createCoupon} className="h-fit rounded-2xl bg-white p-5 shadow-sm"><h2 className="font-black">Discount coupon</h2><input required value={coupon.code} onChange={(e) => setCoupon({ ...coupon, code: e.target.value })} placeholder="Code" className="mt-3 w-full rounded-lg border px-3 py-2" /><input type="number" min="1" max="100" value={coupon.percentOff} onChange={(e) => setCoupon({ ...coupon, percentOff: e.target.value, amountOff: "" })} placeholder="Percent off (1-100)" className="mt-2 w-full rounded-lg border px-3 py-2" /><div className="my-2 text-center text-xs text-slate-400">or</div><input type="number" min="0.01" step="0.01" value={coupon.amountOff} onChange={(e) => setCoupon({ ...coupon, amountOff: e.target.value, percentOff: "" })} placeholder="Fixed INR discount" className="w-full rounded-lg border px-3 py-2" /><button className="mt-3 w-full rounded-lg bg-indigo-600 py-2.5 font-bold text-white">Create coupon</button></form></section>}
    </div>
  </main>;
}
