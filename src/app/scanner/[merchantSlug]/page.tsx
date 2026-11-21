'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { PosScanWorkspace } from '@/components/scanner/PosScanWorkspace';

export default function PosScannerRoutePage() {
  const params = useParams();
  const rawSlug = params?.merchantSlug;
  const merchantSlug =
    typeof rawSlug === 'string' && rawSlug.trim() ? rawSlug.trim().toLowerCase() : 'cafe-canelo';

  return <PosScanWorkspace merchantSlug={merchantSlug} />;
}
