import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

export const prerender = false;

interface ServiceAccountKey {
	client_email: string;
	private_key: string;
	token_uri?: string;
}

interface SheetMetadata {
	sheets?: Array<{ properties?: { title?: string } }>;
}

interface BatchGetResponse {
	valueRanges?: Array<{ values?: string[][] }>;
}

interface CompanyRow {
	slug: string;
	name: string;
	postalCode: string;
	address: string;
	phone: string;
	email: string;
	contactPerson: string;
	isActive: number;
}

interface QaRow {
	category: string;
	question: string;
	answer: string;
	isActive: number;
}

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const IDENTIFIER_PATTERN = /^[A-Za-z0-9]+$/;

export const POST: APIRoute = async ({ request }) => {
	const authorization = request.headers.get('Authorization');
	if (authorization !== `Bearer ${env.REFRESH_TOKEN}`) {
		return json({ message: '認証に失敗しました。更新トークンをご確認ください。' }, 401);
	}

	try {
		const accessToken = await getAccessToken(env.GOOGLE_SERVICE_ACCOUNT_KEY);
		const baseUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.SPREADSHEET_ID)}`;
		const metadata = await googleFetch<SheetMetadata>(
			`${baseUrl}?fields=sheets.properties.title`,
			accessToken,
		);
		const individualTabs = (metadata.sheets ?? [])
			.map((sheet) => sheet.properties?.title ?? '')
			.filter((title) => title.startsWith('個別QA_'));

		const ranges = ['設定', '共通QA', ...individualTabs];
		const query = ranges.map((range) => `ranges=${encodeURIComponent(quoteSheetName(range))}`).join('&');
		const batch = await googleFetch<BatchGetResponse>(
			`${baseUrl}/values:batchGet?${query}&majorDimension=ROWS`,
			accessToken,
		);
		const valueRanges = batch.valueRanges ?? [];
		if (valueRanges.length !== ranges.length) {
			throw new Error('Google Sheetsから必要なシートをすべて取得できませんでした。');
		}

		const companies = parseCompanies(valueRanges[0]?.values ?? []);
		const slugs = new Set(companies.map((company) => company.slug));
		const orphanedTabs = individualTabs.filter((tab) => !slugs.has(tab.slice('個別QA_'.length)));
		if (orphanedTabs.length > 0) {
			return json({ message: `設定に識別子がない個別QAタブがあります: ${orphanedTabs.join('、')}` }, 400);
		}

		const commonQa = parseQa(valueRanges[1]?.values ?? [], '共通QA');
		const companyQa = individualTabs.flatMap((tab, index) =>
			parseQa(valueRanges[index + 2]?.values ?? [], tab).map((qa) => ({
				...qa,
				companySlug: tab.slice('個別QA_'.length),
			})),
		);

		const now = new Date().toISOString();
		const statements: D1PreparedStatement[] = [];
		for (const company of companies) {
			statements.push(
				env.DB.prepare(`
					INSERT INTO companies
					(slug, name, postal_code, address, phone, email, contact_person, is_active, updated_at)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(slug) DO UPDATE SET
						name = excluded.name,
						postal_code = excluded.postal_code,
						address = excluded.address,
						phone = excluded.phone,
						email = excluded.email,
						contact_person = excluded.contact_person,
						is_active = excluded.is_active,
						updated_at = excluded.updated_at
				`).bind(
					company.slug, company.name, company.postalCode, company.address, company.phone,
					company.email, company.contactPerson, company.isActive, now,
				),
			);
		}
		statements.push(env.DB.prepare('DELETE FROM common_qa'));
		for (const qa of commonQa) {
			statements.push(
				env.DB.prepare(`
					INSERT INTO common_qa (category, question, answer, is_active)
					VALUES (?, ?, ?, ?)
				`).bind(qa.category, qa.question, qa.answer, qa.isActive),
			);
		}
		statements.push(env.DB.prepare('DELETE FROM company_qa'));
		for (const qa of companyQa) {
			statements.push(
				env.DB.prepare(`
					INSERT INTO company_qa (company_slug, category, question, answer, is_active)
					VALUES (?, ?, ?, ?, ?)
				`).bind(qa.companySlug, qa.category, qa.question, qa.answer, qa.isActive),
			);
		}

		await env.DB.batch(statements);
		return json({ message: `${companies.length}社・${commonQa.length + companyQa.length}件のQAを反映しました` });
	} catch (error) {
		console.error('Spreadsheet refresh failed', error);
		return json({ message: error instanceof Error ? error.message : '更新中に予期しないエラーが発生しました。' }, 500);
	}
};

export const ALL: APIRoute = () => json({ message: 'このエンドポイントはPOSTメソッドのみ利用できます。' }, 405, { Allow: 'POST' });

function parseCompanies(values: string[][]): CompanyRow[] {
	const rows = rowsAsObjects(values, '設定');
	const seen = new Set<string>();
	return rows.map((row, index) => {
		const slug = cell(row, '識別子');
		const name = cell(row, '会社名');
		if (!slug || !IDENTIFIER_PATTERN.test(slug)) {
			throw new Error(`設定の${index + 2}行目: 識別子は半角英数字で入力してください。`);
		}
		if (seen.has(slug)) throw new Error(`設定に重複した識別子があります: ${slug}`);
		if (!name) throw new Error(`設定の${index + 2}行目: 会社名が空です。`);
		seen.add(slug);
		return {
			slug,
			name,
			postalCode: cell(row, '郵便番号'),
			address: cell(row, '住所'),
			phone: cell(row, '電話番号'),
			email: cell(row, 'メールアドレス'),
			contactPerson: cell(row, '担当者名'),
			isActive: isPublished(cell(row, '公開')),
		};
	});
}

function parseQa(values: string[][], sheetName: string): QaRow[] {
	return rowsAsObjects(values, sheetName).map((row, index) => {
		const category = cell(row, 'カテゴリ');
		const question = cell(row, '質問');
		const answer = cell(row, '回答');
		if (!category || !question || !answer) {
			throw new Error(`${sheetName}の${index + 2}行目: カテゴリ・質問・回答は必須です。`);
		}
		return { category, question, answer, isActive: isPublished(cell(row, '公開')) };
	});
}

function rowsAsObjects(values: string[][], sheetName: string): Array<Record<string, string>> {
	if (values.length === 0) throw new Error(`${sheetName}シートにヘッダー行がありません。`);
	const headers = values[0].map((header) => header.trim());
	return values.slice(1)
		.filter((row) => row.some((value) => value.trim() !== ''))
		.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

function cell(row: Record<string, string>, header: string): string {
	return (row[header] ?? '').trim();
}

function isPublished(value: string): number {
	return value.toUpperCase() === 'TRUE' ? 1 : 0;
}

function quoteSheetName(sheetName: string): string {
	return `'${sheetName.replaceAll("'", "''")}'`;
}

async function getAccessToken(rawKey: string): Promise<string> {
	let serviceAccount: ServiceAccountKey;
	try {
		serviceAccount = JSON.parse(rawKey) as ServiceAccountKey;
	} catch {
		throw new Error('GOOGLE_SERVICE_ACCOUNT_KEYが正しいJSONではありません。');
	}
	if (!serviceAccount.client_email || !serviceAccount.private_key) {
		throw new Error('GOOGLE_SERVICE_ACCOUNT_KEYに必要な認証情報がありません。');
	}

	const tokenUri = serviceAccount.token_uri ?? 'https://oauth2.googleapis.com/token';
	const now = Math.floor(Date.now() / 1000);
	const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const claims = base64Url(JSON.stringify({
		iss: serviceAccount.client_email,
		scope: SHEETS_SCOPE,
		aud: tokenUri,
		iat: now,
		exp: now + 3600,
	}));
	const unsignedToken = `${header}.${claims}`;
	const privateKey = await crypto.subtle.importKey(
		'pkcs8',
		pemToBuffer(serviceAccount.private_key),
		{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
		false,
		['sign'],
	);
	const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(unsignedToken));
	const assertion = `${unsignedToken}.${base64Url(signature)}`;

	const response = await fetch(tokenUri, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
	});
	const payload = await response.json() as { access_token?: string; error_description?: string };
	if (!response.ok || !payload.access_token) {
		throw new Error(`Google認証に失敗しました: ${payload.error_description ?? response.statusText}`);
	}
	return payload.access_token;
}

async function googleFetch<T>(url: string, accessToken: string): Promise<T> {
	const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
	if (!response.ok) {
		const payload = await response.json().catch(() => null) as { error?: { message?: string } } | null;
		throw new Error(`Google Sheetsの取得に失敗しました: ${payload?.error?.message ?? response.statusText}`);
	}
	return response.json() as Promise<T>;
}

function pemToBuffer(pem: string): ArrayBuffer {
	const base64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
	const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
	return bytes.buffer;
}

function base64Url(value: string | ArrayBuffer): string {
	const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : new Uint8Array(value);
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers },
	});
}
