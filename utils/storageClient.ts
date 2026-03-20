import { createClient } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

const fileStorageUrl = String(import.meta.env.VITE_FILE_STORAGE_URL || '').trim();
const fileStorageAnonKey = String(import.meta.env.VITE_FILE_STORAGE_ANON_KEY || '').trim();

const hasDedicatedStorage = Boolean(fileStorageUrl && fileStorageAnonKey);

export const FILE_STORAGE_BUCKET = String(import.meta.env.VITE_FILE_STORAGE_BUCKET || 'images').trim() || 'images';

export const fileStorageClient = hasDedicatedStorage
  ? createClient<any>(fileStorageUrl, fileStorageAnonKey)
  : supabase;

