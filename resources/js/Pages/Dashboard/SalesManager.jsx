import React, { useState } from 'react';
import ItemsTab from './components/ItemsTab';
import BundlePackageTab from './components/BundlePackageTab';

const TABS = [
    { key: 'items', label: 'Items', icon: '🏷️' },
    { key: 'bundles', label: 'Bundles', icon: '📦' },
    { key: 'packages', label: 'Packages', icon: '🎁' },
];

export default function SalesManager({ saleItems: initialSaleItems = [] }) {
    const [activeTab, setActiveTab] = useState('items');

    return (
        <div className="w-full min-h-[calc(100vh-6rem)] bg-gray-50 p-2 sm:p-4">
            {/* ── TAB BAR ── */}
            <div className="flex items-center gap-1 mb-4 border-b border-gray-200 bg-white rounded-t-xl px-2 shadow-sm">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 -mb-px transition ${
                            activeTab === tab.key
                                ? 'border-[rgb(240,136,176)] text-[rgb(240,136,176)]'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        <span>{tab.icon}</span> {tab.label}
                    </button>
                ))}
            </div>

            {/* ── ACTIVE TAB CONTENT ── */}
            {activeTab === 'items' && <ItemsTab initialSaleItems={initialSaleItems} />}
            {activeTab === 'bundles' && <BundlePackageTab kind="bundle" />}
            {activeTab === 'packages' && <BundlePackageTab kind="package" />}
        </div>
    );
}
