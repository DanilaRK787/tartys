// Privacy policy (RU / KK / EN). Plain, short and true to what the code actually does.
import { lang, t } from './i18n.js';
import { backButton } from './ui.js';

const UPDATED = '29.09.2026';
const TEXT = {
  ru: `<h1>Политика конфиденциальности</h1>
<p class="muted">Редакция от ${UPDATED}. TARTYS — учебный прототип, созданный для отбора Narxoz Incubator 2026.</p>
<h2>Какие данные мы храним</h2>
<ul>
<li><b>Аккаунт:</b> логин и пароль — только в виде хэша. Пароль сначала хэшируется в вашем браузере (SHA-256), затем сервер хэширует его ещё раз (bcrypt). Открытый пароль никогда не покидает устройство.</li>
<li><b>Игровые данные:</b> история матчей, рейтинг, прогресс испытаний и путешествия, выбранное оформление.</li>
<li><b>Тестовые оплаты:</b> тариф, сумма, статус, платёжная система и последние 4 цифры карты. Полный номер карты, срок действия и CVC не сохраняются. Реальные деньги не списываются.</li>
<li><b>В вашем браузере</b> (localStorage / sessionStorage): язык, звук, уровень бота, история и прогресс гостя, токен входа. Рекламных и аналитических cookies и трекеров нет.</li>
<li><b>Технические данные:</b> IP-адрес кратковременно используется в памяти сервера для защиты от перебора паролей и не сохраняется в базу.</li>
</ul>
<p>Мы не запрашиваем имя, e-mail, телефон, геолокацию или фото.</p>
<h2>Зачем</h2>
<p>Чтобы работали вход, история матчей, рейтинг, онлайн-комнаты и оформление, и чтобы защитить игру от злоупотреблений.</p>
<h2>Кто видит данные</h2>
<p>Другие игроки видят ваш ник, рейтинг, число матчей и выбранное оформление. Мы не продаём и не передаём данные третьим лицам. Сервер и база работают на хостинге Render. Шрифты загружаются с Google Fonts, поэтому ваш браузер обращается к серверам Google.</p>
<h2>Хранение и удаление</h2>
<p>Данные хранятся, пока существует аккаунт. Удалить аккаунт со всей историей, рейтингом и платежами можно в любой момент: <a href="#/profile">Профиль</a> → «Удалить аккаунт». Удаление происходит сразу и не может быть отменено. Данные гостя удаляются очисткой данных сайта в браузере.</p>
<h2>Несовершеннолетние</h2>
<p>Игра подходит для школьников и студентов. Мы не собираем личных данных, по которым можно установить личность, поэтому регистрация не требует согласия родителей.</p>
<h2>Связь</h2>
<p>Вопросы о данных можно задать через раздел Issues в GitHub-репозитории проекта.</p>`,
  kk: `<h1>Құпиялылық саясаты</h1>
<p class="muted">${UPDATED} редакциясы. TARTYS — Narxoz Incubator 2026 іріктеуіне жасалған оқу прототипі.</p>
<h2>Қандай деректерді сақтаймыз</h2>
<ul>
<li><b>Аккаунт:</b> логин және құпиясөз — тек хэш түрінде. Құпиясөз алдымен браузеріңізде хэштеледі (SHA-256), содан кейін сервер оны қайта хэштейді (bcrypt). Ашық құпиясөз құрылғыдан ешқашан шықпайды.</li>
<li><b>Ойын деректері:</b> матчтар тарихы, рейтинг, сынақтар мен саяхат прогресі, таңдалған безендіру.</li>
<li><b>Тест төлемдері:</b> тариф, сома, күйі, төлем жүйесі және картаның соңғы 4 саны. Картаның толық нөмірі, мерзімі және CVC сақталмайды. Нақты ақша алынбайды.</li>
<li><b>Браузеріңізде</b> (localStorage / sessionStorage): тіл, дыбыс, бот деңгейі, қонақ тарихы мен прогресі, кіру токені. Жарнамалық және аналитикалық cookies пен трекерлер жоқ.</li>
<li><b>Техникалық деректер:</b> IP-мекенжай құпиясөзді іріктеуден қорғау үшін сервер жадында қысқа уақыт қолданылады және базаға сақталмайды.</li>
</ul>
<p>Біз аты-жөніңізді, e-mail, телефон, геолокация немесе фото сұрамаймыз.</p>
<h2>Не үшін</h2>
<p>Кіру, матчтар тарихы, рейтинг, онлайн бөлмелер мен безендіру жұмыс істеуі үшін және ойынды теріс пайдаланудан қорғау үшін.</p>
<h2>Деректерді кім көреді</h2>
<p>Басқа ойыншылар ник, рейтинг, матчтар саны мен безендіруді көреді. Деректерді сатпаймыз және үшінші тұлғаларға бермейміз. Сервер мен база Render хостингінде жұмыс істейді. Қаріптер Google Fonts-тан жүктеледі.</p>
<h2>Сақтау және жою</h2>
<p>Деректер аккаунт бар кезде сақталады. Аккаунтты барлық тарихымен кез келген уақытта жоюға болады: <a href="#/profile">Профиль</a> → «Аккаунтты жою». Жою бірден орындалады және қайтарылмайды. Қонақ деректері браузердегі сайт деректерін тазалау арқылы жойылады.</p>
<h2>Кәмелетке толмағандар</h2>
<p>Ойын оқушылар мен студенттерге жарайды. Біз жеке басты анықтайтын деректер жинамаймыз.</p>
<h2>Байланыс</h2>
<p>Деректер туралы сұрақтарды жобаның GitHub репозиторийіндегі Issues бөлімі арқылы қоюға болады.</p>`,
  en: `<h1>Privacy policy</h1>
<p class="muted">Version of ${UPDATED}. TARTYS is a study prototype built for the Narxoz Incubator 2026 selection.</p>
<h2>What we store</h2>
<ul>
<li><b>Account:</b> username and password — as a hash only. The password is first hashed in your browser (SHA-256), then hashed again by the server (bcrypt). The plain password never leaves your device.</li>
<li><b>Game data:</b> match history, rating, challenge and journey progress, chosen cosmetics.</li>
<li><b>Test payments:</b> plan, amount, status, card brand and the last 4 digits. The full card number, expiry and CVC are never stored. No real money is charged.</li>
<li><b>In your browser</b> (localStorage / sessionStorage): language, sound, bot level, guest history and progress, login token. No advertising or analytics cookies, no trackers.</li>
<li><b>Technical data:</b> the IP address is used briefly in server memory to stop password guessing and is not written to the database.</li>
</ul>
<p>We never ask for your real name, e-mail, phone, location or photos.</p>
<h2>Why</h2>
<p>To make login, match history, rating, online rooms and cosmetics work, and to protect the game from abuse.</p>
<h2>Who sees it</h2>
<p>Other players see your nickname, rating, number of matches and cosmetics. We do not sell or share data with third parties. The server and database run on Render. Fonts are loaded from Google Fonts, so your browser contacts Google servers.</p>
<h2>Retention and deletion</h2>
<p>Data is kept while the account exists. You can delete the account with all history, rating and payments at any time: <a href="#/profile">Profile</a> → “Delete account”. Deletion is immediate and cannot be undone. Guest data is removed by clearing site data in your browser.</p>
<h2>Minors</h2>
<p>The game is suitable for school and university students. We do not collect data that identifies a person.</p>
<h2>Contact</h2>
<p>Questions about data can be asked via Issues in the project's GitHub repository.</p>`
};

export function privacyScreen(root) {
  root.innerHTML = `<section class="page narrow privacy">${backButton('#/', t('back'), 'prev')}${TEXT[lang()] || TEXT.ru}</section>`;
}
