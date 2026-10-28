
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';

const API_BASE_URL = 'http://192.168.0.104:8788';
const TOKEN_KEY = 'transaksi_auth_token';

type TransactionType = 'masuk' | 'keluar';

type Transaction = {
  id: string;
  title: string;
  category: string;
  date: string;
  amount: number;
  type: TransactionType;
};

type User = {
  id: string;
  nama: string;
  email: string;
};

const categories: Record<TransactionType, string[]> = {
  masuk: ['Gaji', 'Pekerjaan', 'Uang saku', 'Bisnis', 'Hadiah', 'Lainnya'],
  keluar: [
    'Makanan',
    'Transportasi',
    'Belanja',
    'Tagihan',
    'Pendidikan',
    'Kesehatan',
    'Hiburan',
    'Lainnya',
  ],
};

const formatRupiah = (amount: number) =>
  'Rp ' + amount.toLocaleString('id-ID');

const today = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const displayDate = (value: string) => {
  if (!value) return '-';

  if (value === today()) return 'Hari ini';

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  const yesterdayString = [
    yesterday.getFullYear(),
    String(yesterday.getMonth() + 1).padStart(2, '0'),
    String(yesterday.getDate()).padStart(2, '0'),
  ].join('-');

  if (value.slice(0, 10) === yesterdayString) return 'Kemarin';

  const parsed = new Date(`${value.slice(0, 10)}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) return value;

  return parsed.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

async function getToken() {
  if (Platform.OS === 'web') {
    return typeof localStorage !== 'undefined'
      ? localStorage.getItem(TOKEN_KEY)
      : null;
  }

  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function saveToken(token: string) {
  if (Platform.OS === 'web') {
    localStorage.setItem(TOKEN_KEY, token);
    return;
  }

  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function removeToken() {
  if (Platform.OS === 'web') {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }

  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error(
      `Tidak dapat menghubungi server. Pastikan backend berjalan dan alamat API benar: ${API_BASE_URL}`,
    );
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message ||
        result.error ||
        `Permintaan gagal (${response.status}).`,
    );
  }

  return result as T;
}

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

export default function HomeScreen() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [formVisible, setFormVisible] = useState(false);
  const [type, setType] = useState<TransactionType>('keluar');
  const [title, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState('Makanan');

  const loadTransactions = useCallback(async (activeToken: string) => {
    const result = await apiRequest<{ data: Transaction[] }>(
      '/api/transaksi',
      { method: 'GET' },
      activeToken,
    );

    setTransactions(Array.isArray(result.data) ? result.data : []);
  }, []);

  const restoreSession = useCallback(async () => {
    setLoading(true);

    try {
      const storedToken = await getToken();

      if (!storedToken) {
        setToken(null);
        setUser(null);
        setTransactions([]);
        return;
      }

      try {
        const result = await apiRequest<{ user: User }>(
          '/api/auth/me',
          { method: 'GET' },
          storedToken,
        );

        setToken(storedToken);
        setUser(result.user);
        await loadTransactions(storedToken);
      } catch (error) {
        const message =
          error instanceof Error ? error.message.toLowerCase() : '';

        if (
          message.includes('token') ||
          message.includes('unauthorized') ||
          message.includes('session') ||
          message.includes('sesi') ||
          message.includes('401')
        ) {
          await removeToken();
          setToken(null);
          setUser(null);
          setTransactions([]);
        } else {
          showMessage(
            'Gagal memuat data',
            error instanceof Error ? error.message : 'Terjadi kesalahan.',
          );
        }
      }
    } catch (error) {
      showMessage(
        'Gagal memulai aplikasi',
        error instanceof Error ? error.message : 'Terjadi kesalahan.',
      );
    } finally {
      setLoading(false);
    }
  }, [loadTransactions]);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const handleAuth = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanNama = nama.trim();

    if (authMode === 'register' && !cleanNama) {
      showMessage('Nama belum diisi', 'Masukkan nama kamu.');
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      showMessage('Email tidak valid', 'Masukkan alamat email yang benar.');
      return;
    }

    if (password.length < 8) {
      showMessage(
        'Kata sandi belum valid',
        'Gunakan kata sandi minimal 8 karakter.',
      );
      return;
    }

    setSaving(true);

    try {
      if (authMode === 'register') {
        await apiRequest('/api/auth/register', {
          method: 'POST',
          body: JSON.stringify({
            nama: cleanNama,
            email: cleanEmail,
            password,
          }),
        });
      }

      const result = await apiRequest<{
        success: boolean;
        token: string;
        user: User;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: cleanEmail,
          password,
        }),
      });

      await saveToken(result.token);
      setToken(result.token);
      setUser(result.user);
      setPassword('');

      await loadTransactions(result.token);
    } catch (error) {
      showMessage(
        authMode === 'register' ? 'Registrasi gagal' : 'Login gagal',
        error instanceof Error ? error.message : 'Terjadi kesalahan.',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    const performLogout = async () => {
      const currentToken = token;

      setSaving(true);

      try {
        if (currentToken) {
          await apiRequest(
            '/api/auth/logout',
            { method: 'POST' },
            currentToken,
          );
        }
      } catch {
        // Hapus sesi lokal walaupun server tidak dapat dijangkau.
      } finally {
        await removeToken();
        setToken(null);
        setUser(null);
        setTransactions([]);
        setPassword('');
        setSaving(false);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm('Yakin ingin keluar dari akun?')) {
        void performLogout();
      }
      return;
    }

    Alert.alert('Keluar akun', 'Yakin ingin keluar dari akun?', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Keluar',
        style: 'destructive',
        onPress: () => void performLogout(),
      },
    ]);
  };

  const openForm = () => {
    setType('keluar');
    setTitle('');
    setAmountInput('');
    setCategory('Makanan');
    setFormVisible(true);
  };

  const changeType = (newType: TransactionType) => {
    setType(newType);
    setCategory(categories[newType][0]);
  };

  const saveTransaction = async () => {
    const cleanTitle = title.trim();
    const cleanAmount = amountInput.trim();

    if (!cleanTitle) {
      showMessage('Keterangan belum diisi', 'Masukkan nama transaksi.');
      return;
    }

    if (!cleanAmount || !/^\d+$/.test(cleanAmount)) {
      showMessage(
        'Nominal tidak valid',
        'Masukkan angka tanpa titik atau koma. Contoh: 25000.',
      );
      return;
    }

    const amount = Number(cleanAmount);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      showMessage(
        'Nominal tidak valid',
        'Nominal harus lebih dari nol dan tidak terlalu besar.',
      );
      return;
    }

    if (!token) return;

    setSaving(true);

    try {
      await apiRequest(
        '/api/transaksi',
        {
          method: 'POST',
          body: JSON.stringify({
            title: cleanTitle,
            amount,
            type,
            category,
            date: today(),
          }),
        },
        token,
      );

      await loadTransactions(token);
      setFormVisible(false);
      setTitle('');
      setAmountInput('');

      showMessage('Berhasil', 'Transaksi berhasil disimpan ke database.');
    } catch (error) {
      showMessage(
        'Gagal menyimpan transaksi',
        error instanceof Error ? error.message : 'Terjadi kesalahan.',
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteTransaction = async (transaction: Transaction) => {
    if (!token) return;

    setSaving(true);

    try {
      await apiRequest(
        `/api/transaksi/${encodeURIComponent(transaction.id)}`,
        { method: 'DELETE' },
        token,
      );

      await loadTransactions(token);
      showMessage('Berhasil', 'Transaksi berhasil dihapus.');
    } catch (error) {
      showMessage(
        'Gagal menghapus transaksi',
        error instanceof Error ? error.message : 'Terjadi kesalahan.',
      );
    } finally {
      setSaving(false);
    }
  };

  const showTransactionDetails = (transaction: Transaction) => {
    const details = [
      `Jenis: ${transaction.type === 'masuk' ? 'Pemasukan' : 'Pengeluaran'}`,
      `Kategori: ${transaction.category}`,
      `Tanggal: ${displayDate(transaction.date)}`,
      `Nominal: ${formatRupiah(transaction.amount)}`,
    ].join('\n');

    if (Platform.OS === 'web') {
      const shouldDelete = window.confirm(
        `${transaction.title}\n\n${details}\n\nTekan OK jika ingin menghapus transaksi ini.`,
      );

      if (shouldDelete) void deleteTransaction(transaction);
      return;
    }

    Alert.alert(transaction.title, details, [
      { text: 'Tutup', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Hapus transaksi?',
            `Transaksi "${transaction.title}" akan dihapus dari database.`,
            [
              { text: 'Batal', style: 'cancel' },
              {
                text: 'Hapus',
                style: 'destructive',
                onPress: () => void deleteTransaction(transaction),
              },
            ],
          );
        },
      },
    ]);
  };

  const income = transactions
    .filter((item) => item.type === 'masuk')
    .reduce((total, item) => total + item.amount, 0);

  const expense = transactions
    .filter((item) => item.type === 'keluar')
    .reduce((total, item) => total + item.amount, 0);

  const balance = income - expense;

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#174C35" />
        <Text style={styles.loadingText}>Memeriksa sesi akun...</Text>
      </SafeAreaView>
    );
  }

  if (!user || !token) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" />
        <KeyboardAvoidingView
          style={styles.authScreen}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.authContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.brandIcon}>
              <Text style={styles.brandIconText}>◈</Text>
            </View>

            <Text style={styles.authHeading}>Keuangan Saya</Text>
            <Text style={styles.authSubtitle}>
              Catat uang masuk dan keluar dengan lebih mudah.
            </Text>

            <View style={styles.authCard}>
              <View style={styles.authModeRow}>
                <TouchableOpacity
                  style={[
                    styles.authModeButton,
                    authMode === 'login' && styles.authModeActive,
                  ]}
                  onPress={() => setAuthMode('login')}
                >
                  <Text
                    style={[
                      styles.authModeText,
                      authMode === 'login' && styles.authModeTextActive,
                    ]}
                  >
                    Login
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.authModeButton,
                    authMode === 'register' && styles.authModeActive,
                  ]}
                  onPress={() => setAuthMode('register')}
                >
                  <Text
                    style={[
                      styles.authModeText,
                      authMode === 'register' && styles.authModeTextActive,
                    ]}
                  >
                    Daftar akun
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                style={styles.textInput}
                value={email}
                onChangeText={setEmail}
                placeholder="nama@email.com"
                placeholderTextColor="#9AA49D"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              {authMode === 'register' && (
                <>
                  <Text style={styles.inputLabel}>Nama</Text>
                  <TextInput
                    style={styles.textInput}
                    value={nama}
                    onChangeText={setNama}
                    placeholder="Nama kamu"
                    placeholderTextColor="#9AA49D"
                    maxLength={80}
                  />
                </>
              )}

              <Text style={styles.inputLabel}>Kata sandi</Text>
              <TextInput
                style={styles.textInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Minimal 8 karakter"
                placeholderTextColor="#9AA49D"
                secureTextEntry
                autoCapitalize="none"
                onSubmitEditing={() => void handleAuth()}
              />

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={() => void handleAuth()}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {authMode === 'login' ? 'Masuk' : 'Buat akun'}
                  </Text>
                )}
              </TouchableOpacity>

              <Text style={styles.authFootnote}>
                Gunakan akun pribadi kamu. Pastikan backend sedang berjalan.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.greeting}>SELAMAT DATANG 👋</Text>
            <Text style={styles.heading} numberOfLines={1}>
              {user.nama || 'Keuangan Saya'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.avatar}
            onPress={handleLogout}
            accessibilityLabel="Keluar dari akun"
          >
            <Text style={styles.avatarText}>
              {(user.nama || 'Y').charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.emailText}>{user.email}</Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total saldo</Text>
          <Text style={styles.balanceAmount}>{formatRupiah(balance)}</Text>

          <View style={styles.balanceFooter}>
            <Text style={styles.balanceHint}>Keuanganmu, kendalimu.</Text>
            <Text style={styles.walletIcon}>◈</Text>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIconIncome}>
              <Text style={styles.summaryIconText}>↓</Text>
            </View>
            <Text style={styles.summaryLabel}>Pemasukan</Text>
            <Text style={styles.summaryAmount}>{formatRupiah(income)}</Text>
          </View>

          <View style={styles.summaryCard}>
            <View style={styles.summaryIconExpense}>
              <Text style={styles.summaryIconText}>↑</Text>
            </View>
            <Text style={styles.summaryLabel}>Pengeluaran</Text>
            <Text style={styles.summaryAmount}>{formatRupiah(expense)}</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeadingContainer}>
            <Text style={styles.sectionTitle}>Transaksi terbaru</Text>
            <Text style={styles.sectionSubtitle}>
              Ketuk transaksi untuk melihat detail
            </Text>
          </View>
          <Text style={styles.transactionCount}>
            {transactions.length} transaksi
          </Text>
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Belum ada transaksi</Text>
            <Text style={styles.emptySubtitle}>
              Tambahkan transaksi pertama untuk mulai mencatat keuanganmu.
            </Text>
          </View>
        ) : (
          transactions.map((transaction) => (
            <TouchableOpacity
              key={transaction.id}
              style={styles.transactionCard}
              onPress={() => showTransactionDetails(transaction)}
              activeOpacity={0.75}
              disabled={saving}
            >
              <View
                style={[
                  styles.transactionIcon,
                  transaction.type === 'masuk'
                    ? styles.incomeIcon
                    : styles.expenseIcon,
                ]}
              >
                <Text style={styles.transactionEmoji}>
                  {transaction.type === 'masuk' ? '↓' : '↑'}
                </Text>
              </View>

              <View style={styles.transactionInfo}>
                <Text style={styles.transactionTitle} numberOfLines={1}>
                  {transaction.title}
                </Text>
                <Text style={styles.transactionMeta} numberOfLines={1}>
                  {transaction.category} · {displayDate(transaction.date)}
                </Text>
              </View>

              <Text
                style={[
                  styles.transactionAmount,
                  transaction.type === 'masuk'
                    ? styles.incomeText
                    : styles.expenseText,
                ]}
                numberOfLines={1}
              >
                {transaction.type === 'masuk' ? '+' : '-'}
                {formatRupiah(transaction.amount)}
              </Text>
            </TouchableOpacity>
          ))
        )}

        <TouchableOpacity
          style={[styles.addButton, saving && styles.disabledButton]}
          onPress={openForm}
          activeOpacity={0.8}
          disabled={saving}
        >
          <Text style={styles.addButtonText}>＋ Tambah Transaksi</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.refreshButton}
          onPress={() => void loadTransactions(token)}
          disabled={saving}
        >
          <Text style={styles.refreshButtonText}>↻ Muat ulang transaksi</Text>
        </TouchableOpacity>

        <Text style={styles.disclaimer}>
          Transaksi tersimpan melalui server. Ketuk avatar untuk keluar.
        </Text>
      </ScrollView>

      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFormVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderText}>
                <Text style={styles.modalTitle}>Tambah transaksi</Text>
                <Text style={styles.modalSubtitle}>
                  Catat setiap uang masuk dan keluar.
                </Text>
              </View>

              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setFormVisible(false)}
                accessibilityLabel="Tutup formulir"
              >
                <Text style={styles.closeButtonText}>×</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.inputLabel}>Jenis transaksi</Text>

              <View style={styles.typeRow}>
                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    type === 'masuk' && styles.typeButtonIncomeActive,
                  ]}
                  onPress={() => changeType('masuk')}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      type === 'masuk' && styles.typeButtonTextActive,
                    ]}
                  >
                    ↓ Pemasukan
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.typeButton,
                    type === 'keluar' && styles.typeButtonExpenseActive,
                  ]}
                  onPress={() => changeType('keluar')}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      type === 'keluar' && styles.typeButtonTextActive,
                    ]}
                  >
                    ↑ Pengeluaran
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Keterangan</Text>
              <TextInput
                style={styles.textInput}
                value={title}
                onChangeText={setTitle}
                placeholder="Contoh: Beli makan siang"
                placeholderTextColor="#9AA49D"
                maxLength={80}
                returnKeyType="next"
              />

              <Text style={styles.inputLabel}>Nominal (rupiah)</Text>
              <TextInput
                style={styles.textInput}
                value={amountInput}
                onChangeText={(value) =>
                  setAmountInput(value.replace(/[^\d]/g, ''))
                }
                placeholder="Contoh: 25000"
                placeholderTextColor="#9AA49D"
                keyboardType="number-pad"
                maxLength={15}
              />

              {amountInput.length > 0 && Number(amountInput) > 0 ? (
                <Text style={styles.amountPreview}>
                  {formatRupiah(Number(amountInput))}
                </Text>
              ) : null}

              <Text style={styles.inputLabel}>Kategori</Text>
              <View style={styles.categoryGrid}>
                {categories[type].map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[
                      styles.categoryChip,
                      category === item && styles.categoryChipActive,
                    ]}
                    onPress={() => setCategory(item)}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        category === item && styles.categoryChipTextActive,
                      ]}
                    >
                      {item}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.saveButton, saving && styles.disabledButton]}
                onPress={() => void saveTransaction()}
                disabled={saving}
                activeOpacity={0.8}
              >
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>Simpan transaksi</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setFormVisible(false)}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Batal</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F5F7F5',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F7F5',
  },
  loadingText: {
    color: '#648071',
    marginTop: 12,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  headerText: {
    flex: 1,
    marginRight: 12,
  },
  greeting: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: '#648071',
    marginBottom: 6,
  },
  heading: {
    fontSize: 25,
    fontWeight: '800',
    color: '#173D2D',
  },
  emailText: {
    fontSize: 12,
    color: '#879189',
    marginBottom: 20,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#DCEBE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#20583A',
    fontSize: 20,
    fontWeight: '800',
  },
  balanceCard: {
    backgroundColor: '#174C35',
    borderRadius: 24,
    padding: 24,
    marginBottom: 18,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#C6DFCF',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 10,
  },
  balanceFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  balanceHint: {
    color: '#C6DFCF',
    fontSize: 12,
  },
  walletIcon: {
    fontSize: 30,
    color: '#D8F0DE',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 28,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1,
    borderColor: '#E8EEE9',
  },
  summaryIconIncome: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#E1F5E7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryIconExpense: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: '#FCE8E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  summaryIconText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#254C37',
  },
  summaryLabel: {
    color: '#77837B',
    fontSize: 12,
    marginBottom: 7,
  },
  summaryAmount: {
    color: '#21392B',
    fontSize: 15,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionHeadingContainer: {
    flex: 1,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1B3526',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#879189',
    marginTop: 5,
  },
  transactionCount: {
    color: '#648071',
    fontSize: 11,
    fontWeight: '600',
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDF0ED',
  },
  transactionIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomeIcon: {
    backgroundColor: '#E1F5E7',
  },
  expenseIcon: {
    backgroundColor: '#FCE8E5',
  },
  transactionEmoji: {
    fontSize: 23,
    fontWeight: '700',
    color: '#28523A',
  },
  transactionInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 6,
  },
  transactionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#23382A',
  },
  transactionMeta: {
    fontSize: 11,
    color: '#8A948D',
    marginTop: 5,
  },
  transactionAmount: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  incomeText: {
    color: '#23864D',
  },
  expenseText: {
    color: '#D45C4D',
  },
  addButton: {
    backgroundColor: '#174C35',
    paddingVertical: 17,
    borderRadius: 17,
    alignItems: 'center',
    marginTop: 12,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  refreshButton: {
    paddingVertical: 13,
    alignItems: 'center',
  },
  refreshButtonText: {
    color: '#286044',
    fontSize: 13,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.65,
  },
  disclaimer: {
    color: '#89938C',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 17,
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#23382A',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#879189',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 35, 24, 0.5)',
  },
  modalCard: {
    backgroundColor: '#F8FAF8',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 28,
    maxHeight: '92%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  modalHeaderText: {
    flex: 1,
    marginRight: 10,
  },
  modalTitle: {
    color: '#173D2D',
    fontSize: 23,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: '#879189',
    fontSize: 12,
    marginTop: 6,
  },
  closeButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#E8EEE9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 27,
    color: '#365541',
    lineHeight: 30,
  },
  inputLabel: {
    color: '#304638',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
    marginTop: 16,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 13,
    backgroundColor: '#E9EEEA',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E1E8E2',
  },
  typeButtonIncomeActive: {
    backgroundColor: '#DDF3E4',
    borderColor: '#85C99B',
  },
  typeButtonExpenseActive: {
    backgroundColor: '#FBE6E2',
    borderColor: '#E8A39A',
  },
  typeButtonText: {
    color: '#65756A',
    fontSize: 13,
    fontWeight: '700',
  },
  typeButtonTextActive: {
    color: '#214B32',
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8E1',
    borderRadius: 14,
    paddingHorizontal: 15,
    paddingVertical: 14,
    fontSize: 15,
    color: '#23382A',
  },
  amountPreview: {
    color: '#23864D',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    marginTop: 8,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  categoryChip: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: '#E9EEEA',
    borderWidth: 1,
    borderColor: '#E1E8E2',
  },
  categoryChipActive: {
    backgroundColor: '#DDF3E4',
    borderColor: '#85C99B',
  },
  categoryChipText: {
    fontSize: 12,
    color: '#5D6F62',
    fontWeight: '600',
  },
  categoryChipTextActive: {
    color: '#20583A',
    fontWeight: '800',
  },
  saveButton: {
    backgroundColor: '#174C35',
    paddingVertical: 16,
    borderRadius: 15,
    alignItems: 'center',
    marginTop: 28,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  cancelButton: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  cancelButtonText: {
    color: '#65756A',
    fontSize: 14,
    fontWeight: '700',
  },
  authScreen: {
    flex: 1,
  },
  authContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 22,
  },
  brandIcon: {
    width: 66,
    height: 66,
    borderRadius: 22,
    backgroundColor: '#DCEBE0',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 18,
  },
  brandIconText: {
    color: '#20583A',
    fontSize: 36,
  },
  authHeading: {
    color: '#173D2D',
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  authSubtitle: {
    color: '#879189',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  authCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E8EEE9',
    padding: 20,
  },
  authModeRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 5,
    borderRadius: 14,
    backgroundColor: '#F0F4F0',
  },
  authModeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 10,
  },
  authModeActive: {
    backgroundColor: '#DCEBE0',
  },
  authModeText: {
    color: '#65756A',
    fontSize: 13,
    fontWeight: '700',
  },
  authModeTextActive: {
    color: '#20583A',
  },
  authFootnote: {
    color: '#879189',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 16,
  },
});


