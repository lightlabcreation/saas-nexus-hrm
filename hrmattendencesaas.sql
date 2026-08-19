-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: May 29, 2026 at 01:40 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `hrmattendencesaas`
--

-- --------------------------------------------------------

--
-- Table structure for table `attendance`
--

CREATE TABLE `attendance` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `employee_id` int(11) NOT NULL,
  `date` date NOT NULL,
  `in_time` datetime DEFAULT NULL,
  `out_time` datetime DEFAULT NULL,
  `total_hours` decimal(10,2) DEFAULT 0.00,
  `status` enum('present','absent','late','half_day') DEFAULT 'present',
  `marked_by` int(11) DEFAULT NULL,
  `holiday_name` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `attendance`
--

INSERT INTO `attendance` (`id`, `company_id`, `employee_id`, `date`, `in_time`, `out_time`, `total_hours`, `status`, `marked_by`, `holiday_name`, `created_at`, `updated_at`) VALUES
(1, 4, 1, '2026-05-28', '2026-05-28 16:28:00', '2026-05-28 16:29:12', 0.02, 'present', NULL, NULL, '2026-05-28 10:58:00', '2026-05-28 10:59:12'),
(2, 4, 2, '2026-05-28', '2026-05-28 18:29:32', '2026-05-28 18:29:47', 0.00, 'present', NULL, NULL, '2026-05-28 12:59:32', '2026-05-28 12:59:47'),
(4, 4, 2, '2026-05-29', '2026-05-29 16:32:58', NULL, 0.00, 'present', NULL, NULL, '2026-05-29 11:02:58', '2026-05-29 11:02:58');

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `admin_id` int(11) DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `target_id` int(11) DEFAULT NULL,
  `details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `companies`
--

CREATE TABLE `companies` (
  `id` int(11) NOT NULL,
  `company_name` varchar(150) NOT NULL,
  `owner_name` varchar(150) DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `plan` varchar(100) DEFAULT NULL,
  `employee_limit` int(11) DEFAULT 0,
  `status` enum('active','inactive','trial','suspended') DEFAULT 'active',
  `trial_expiry` date DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `companies`
--

INSERT INTO `companies` (`id`, `company_name`, `owner_name`, `email`, `phone`, `plan`, `employee_limit`, `status`, `trial_expiry`, `created_by`, `created_at`, `updated_at`) VALUES
(1, 'aza', 'aza', 'aza@gmail.com', NULL, 'Free Trial', 0, 'active', '2026-06-03', NULL, '2026-05-27 11:57:26', '2026-05-27 11:57:26'),
(2, 'aaa', 'aaa', 'aaa@gmail.com', NULL, 'Free Trial', 0, 'active', '2026-06-03', NULL, '2026-05-27 12:05:33', '2026-05-27 12:05:33'),
(3, 'abc', 'abc', 'abc@gmail.com', NULL, 'Free Trial', 0, 'active', '2026-06-04', NULL, '2026-05-28 10:49:38', '2026-05-28 10:49:38'),
(4, 'abc', 'abc', 'abcd@gmail.com', NULL, 'Free Trial', 0, 'active', '2026-06-04', NULL, '2026-05-28 10:50:30', '2026-05-28 10:50:30');

-- --------------------------------------------------------

--
-- Table structure for table `company_requests`
--

CREATE TABLE `company_requests` (
  `id` int(11) NOT NULL,
  `company_name` varchar(150) NOT NULL,
  `owner_name` varchar(150) DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `plan` varchar(100) DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `employees`
--

CREATE TABLE `employees` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `machine_id` varchar(50) DEFAULT NULL,
  `custom_id` varchar(50) DEFAULT '',
  `name` varchar(100) NOT NULL,
  `role` varchar(50) DEFAULT 'employee',
  `department` varchar(100) DEFAULT 'General',
  `shift` enum('Morning Shift','Evening Shift','Night Shift') DEFAULT 'Morning Shift',
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT '',
  `salary_rate` decimal(10,2) DEFAULT 0.00,
  `salary_type` enum('hourly','daily','monthly') DEFAULT 'hourly',
  `status` enum('active','on_leave','terminated') DEFAULT 'active',
  `joined_date` date DEFAULT NULL,
  `photo` longtext DEFAULT NULL,
  `uif_number` varchar(50) DEFAULT '',
  `is_uif_registered` tinyint(1) DEFAULT 1,
  `advance_balance` decimal(10,2) DEFAULT 0.00,
  `signature` longtext DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `employees`
--

INSERT INTO `employees` (`id`, `company_id`, `machine_id`, `custom_id`, `name`, `role`, `department`, `shift`, `email`, `phone`, `salary_rate`, `salary_type`, `status`, `joined_date`, `photo`, `uif_number`, `is_uif_registered`, `advance_balance`, `signature`, `created_by`, `created_at`, `updated_at`) VALUES
(1, 4, '1001', '1001', 'kknsdjn111', 'employee', 'General', 'Morning Shift', 'kknsdjn@gmail.com', '1234567890', 122.00, 'hourly', 'active', '2026-05-28', 'http://localhost:8081/uploads/profile-1779965596433.png', NULL, 1, 0.00, NULL, 5, '2026-05-28 10:53:16', '2026-05-28 10:53:36'),
(2, 4, '1002', '1002', 'gautam sir', 'employee', 'General', 'Morning Shift', 'g@gmail.com', '', 0.00, 'hourly', 'active', '2026-05-28', NULL, '', 1, 0.00, NULL, 5, '2026-05-28 12:48:17', '2026-05-28 12:48:17');

-- --------------------------------------------------------

--
-- Table structure for table `face_embeddings`
--

CREATE TABLE `face_embeddings` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `employee_id` int(11) NOT NULL,
  `descriptor` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`descriptor`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `face_embeddings`
--

INSERT INTO `face_embeddings` (`id`, `company_id`, `employee_id`, `descriptor`, `created_at`, `updated_at`) VALUES
(1, NULL, 1, '[-0.1431850790977478,0.13319538533687592,0.06157524138689041,-0.004598474595695734,0.04149791598320007,-0.0487501285970211,0.0024732269812375307,-0.024258345365524292,0.1260937601327896,-0.048751138150691986,0.23171724379062653,-0.033784929662942886,-0.2232206165790558,-0.14774519205093384,0.04256432503461838,0.09645052999258041,-0.015091476030647755,-0.07700524479150772,-0.13311287760734558,-0.09011799097061157,0.015572898089885712,0.019701650366187096,0.017665250226855278,0.0918426662683487,-0.1474490612745285,-0.33679521083831787,-0.07169404625892639,-0.1394084393978119,-0.07584668695926666,-0.17411114275455475,-0.06497877091169357,-0.0015739889349788427,-0.17241699993610382,-0.08199442923069,-0.057980939745903015,0.07605807483196259,-0.013358396477997303,-0.0023032594472169876,0.15932334959506989,0.017621129751205444,-0.10076802223920822,-0.1014939397573471,0.05066546052694321,0.29299986362457275,0.1871415078639984,-0.02350769378244877,0.016981899738311768,0.03592199459671974,0.09715890884399414,-0.2349630743265152,0.07391250133514404,0.061306606978178024,0.13291582465171814,0.10297422111034393,0.14190925657749176,-0.08964581042528152,-0.005661248695105314,0.09268313646316528,-0.16615314781665802,0.040532391518354416,-0.033432696014642715,-0.029985744506120682,-0.08088909089565277,-0.026277726516127586,0.26636603474617004,0.09950734674930573,-0.08950784802436829,-0.09040459245443344,0.14576922357082367,-0.13383792340755463,0.039277348667383194,0.12648162245750427,-0.0851622074842453,-0.1992531716823578,-0.24259641766548157,0.1558893471956253,0.3522597551345825,0.18539048731327057,-0.1742531657218933,0.04249890148639679,-0.16687409579753876,-0.08280127495527267,0.03894876316189766,-0.04799433797597885,-0.046470921486616135,0.09249792993068695,-0.08568538725376129,0.0885566771030426,0.17325474321842194,0.026988662779331207,-0.022962981835007668,0.20810019969940186,-0.03036629967391491,0.025970440357923508,0.04802453890442848,-0.04321659728884697,-0.08064810186624527,0.003736591199412942,-0.10960610210895538,0.014643516391515732,0.054920706897974014,-0.11931941658258438,0.00869444478303194,0.023758236318826675,-0.17642126977443695,0.10312816500663757,0.053897514939308167,-0.003692103084176779,-0.012584934011101723,0.06787776201963425,-0.1850908249616623,-0.06668195128440857,0.15061886608600616,-0.2786059081554413,0.13220375776290894,0.09117397665977478,0.004334116354584694,0.12416339665651321,0.036416780203580856,0.07209234684705734,0.012414482422173023,-0.04738317430019379,-0.09372919052839279,0.004861556924879551,0.12822844088077545,-0.015958212316036224,0.05882281810045242,0.023561546579003334]', '2026-05-28 10:57:17', '2026-05-28 10:57:17'),
(2, NULL, 2, '[-0.06907661259174347,0.10107850283384323,-0.006033292040228844,0.009636988863348961,-0.048410624265670776,-0.02839481085538864,-0.0442039892077446,-0.09140699356794357,0.15446847677230835,-0.05591047927737236,0.18413591384887695,-0.03052862361073494,-0.21173042058944702,-0.025110671296715736,-0.03780314698815346,0.08949711173772812,-0.1738763451576233,-0.12323752790689468,-0.1314648538827896,-0.22640429437160492,-0.007946849800646305,0.04456353187561035,-0.005490184295922518,-0.042687974870204926,-0.12433437258005142,-0.30687204003334045,-0.07160139083862305,-0.11380569636821747,0.16440449655056,-0.10514185577630997,-0.034045636653900146,0.018647821620106697,-0.16454938054084778,-0.06102738156914711,0.014095241203904152,0.03253178671002388,-0.05271606147289276,-0.06948890537023544,0.2145748734474182,0.0722636803984642,-0.13666249811649323,-0.010431192815303802,0.0644145980477333,0.3263777494430542,0.17796418070793152,0.05389059707522392,-0.022746862843632698,-0.031272340565919876,0.06123140826821327,-0.21799317002296448,0.09540783613920212,0.18413330614566803,0.11848292499780655,0.13551218807697296,0.08882705867290497,-0.1744421273469925,0.01613004505634308,0.03820760175585747,-0.11910612136125565,0.06526269018650055,0.07245145738124847,-0.06181216612458229,-0.022974014282226562,-0.05280353128910065,0.22986620664596558,0.09683994948863983,-0.054124169051647186,-0.13521409034729004,0.09743081778287888,-0.18909281492233276,-0.08234113454818726,0.05416042357683182,-0.04521186649799347,-0.12361794710159302,-0.2695266902446747,0.04725794866681099,0.44507336616516113,0.1686704456806183,-0.16153745353221893,0.03428717702627182,-0.08641012758016586,-0.12332935631275177,0.14398670196533203,0.06107322871685028,-0.128066286444664,0.02497508004307747,-0.07939767837524414,-0.0247790589928627,0.2200535237789154,-0.011103974655270576,-0.08828083425760269,0.16558541357517242,-0.021589985117316246,0.035005904734134674,0.0418592244386673,0.019771624356508255,-0.15715377032756805,-0.022786499932408333,-0.05734069645404816,-0.10442395508289337,0.08177035301923752,-0.1396278738975525,-0.009181436151266098,0.09397998452186584,-0.20055623352527618,0.18598857522010803,0.041410062462091446,-0.005467695649713278,0.024358024820685387,0.05554550513625145,-0.05444106459617615,-0.0350629948079586,0.19305694103240967,-0.2589777410030365,0.19553053379058838,0.22097817063331604,0.038271818310022354,0.17443601787090302,0.09289728105068207,0.06972019374370575,-0.029607698321342468,0.022514447569847107,-0.1366625726222992,-0.09613163769245148,-0.05305791646242142,-0.009652436710894108,0.016104796901345253,0.07343082129955292]', '2026-05-28 12:58:41', '2026-05-29 10:59:24');

-- --------------------------------------------------------

--
-- Table structure for table `face_logs`
--

CREATE TABLE `face_logs` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `employee_id` int(11) NOT NULL,
  `status` enum('success','failure') NOT NULL,
  `confidence` decimal(5,4) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `face_logs`
--

INSERT INTO `face_logs` (`id`, `company_id`, `employee_id`, `status`, `confidence`, `created_at`) VALUES
(1, NULL, 1, 'success', 0.2670, '2026-05-28 10:58:00'),
(2, NULL, 1, 'success', 0.2250, '2026-05-28 10:59:12'),
(3, NULL, 2, 'success', 0.2612, '2026-05-28 12:59:32'),
(4, NULL, 2, 'success', 0.3056, '2026-05-28 12:59:47'),
(6, NULL, 2, 'success', 0.5324, '2026-05-29 11:02:58');

-- --------------------------------------------------------

--
-- Table structure for table `payroll`
--

CREATE TABLE `payroll` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `employee_id` int(11) NOT NULL,
  `cycle_start` date NOT NULL,
  `cycle_end` date NOT NULL,
  `total_hours` decimal(10,2) DEFAULT 0.00,
  `gross_earnings` decimal(10,2) DEFAULT 0.00,
  `base_salary` decimal(10,2) DEFAULT 0.00,
  `deductions` decimal(10,2) DEFAULT 0.00,
  `uif_amount` decimal(10,2) DEFAULT 0.00,
  `advance_deduction` decimal(10,2) DEFAULT 0.00,
  `overtime` decimal(10,2) DEFAULT 0.00,
  `net_salary` decimal(10,2) DEFAULT 0.00,
  `status` enum('pending','paid') DEFAULT 'pending',
  `generated_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `shifts_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`shifts_data`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `payroll`
--

INSERT INTO `payroll` (`id`, `company_id`, `employee_id`, `cycle_start`, `cycle_end`, `total_hours`, `gross_earnings`, `base_salary`, `deductions`, `uif_amount`, `advance_deduction`, `overtime`, `net_salary`, `status`, `generated_at`, `shifts_data`) VALUES
(1, NULL, 1, '2026-05-15', '2026-05-30', 0.02, 2.44, 122.00, 0.00, 0.02, 0.00, 0.00, 2.42, 'pending', '2026-05-28 11:04:14', NULL),
(2, NULL, 2, '2026-05-15', '2026-05-30', 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 'pending', '2026-05-29 11:32:58', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `plans`
--

CREATE TABLE `plans` (
  `id` int(11) NOT NULL,
  `name` varchar(100) NOT NULL,
  `price` varchar(50) NOT NULL,
  `duration` varchar(50) NOT NULL,
  `description` text DEFAULT NULL,
  `features` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`features`)),
  `buttonText` varchar(50) DEFAULT 'Get Started',
  `isPopular` tinyint(1) DEFAULT 0,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `plans`
--

INSERT INTO `plans` (`id`, `name`, `price`, `duration`, `description`, `features`, `buttonText`, `isPopular`, `created_by`, `created_at`, `updated_at`) VALUES
(1, 'Free Trial', '$0', '/ 7 days', 'Start your 7-day free trial.', '[\"Up to 10 Employees\", \"Basic Attendance\"]', 'Start Free', 0, NULL, '2026-05-27 10:40:42', '2026-05-27 10:40:42'),
(2, 'Standard Plan', '$49', '/ 1 month', 'Perfect for small teams.', '[\"Up to 50 Employees\", \"Payroll Management\", \"Basic Reports\"]', 'Get Standard', 1, NULL, '2026-05-27 10:40:42', '2026-05-27 10:40:42'),
(3, 'Premium Plan', '$99', '/ 2 months', 'Best value for growing companies.', '[\"Unlimited Employees\", \"GPS & Face Recognition\", \"Advanced Analytics\", \"Priority Support\"]', 'Get Premium', 0, NULL, '2026-05-27 10:40:42', '2026-05-27 10:40:42');

-- --------------------------------------------------------

--
-- Table structure for table `plan_requests`
--

CREATE TABLE `plan_requests` (
  `id` int(11) NOT NULL,
  `company_id` bigint(20) NOT NULL,
  `requested_plan` varchar(255) NOT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `public_holidays`
--

CREATE TABLE `public_holidays` (
  `id` int(11) NOT NULL,
  `holiday_date` date NOT NULL,
  `holiday_name` varchar(150) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `raw_logs`
--

CREATE TABLE `raw_logs` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `machine_user_id` varchar(50) NOT NULL,
  `punch_time` datetime NOT NULL,
  `device_sn` varchar(100) DEFAULT '',
  `is_processed` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `machine_ip` varchar(50) DEFAULT NULL,
  `machine_port` int(11) DEFAULT 4370,
  `machine_alias` varchar(100) DEFAULT 'Main Entrance',
  `sync_interval` int(11) DEFAULT 30,
  `late_deduction` tinyint(1) DEFAULT 1,
  `salary_cycle` varchar(50) DEFAULT '15 Days Cycle',
  `ot_multiplier` decimal(4,2) DEFAULT 1.50,
  `business_name` varchar(255) DEFAULT 'BioTrack Pro',
  `business_address` text DEFAULT NULL,
  `business_phone` varchar(50) DEFAULT '',
  `business_email` varchar(100) DEFAULT '',
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `standard_start_time` time DEFAULT '09:00:00',
  `late_deduction_amount` decimal(10,2) DEFAULT 50.00,
  `grace_period_mins` int(11) DEFAULT 15,
  `standard_end_time` time DEFAULT '17:00:00',
  `weekends` varchar(100) DEFAULT 'Saturday,Sunday'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `settings`
--

INSERT INTO `settings` (`id`, `company_id`, `machine_ip`, `machine_port`, `machine_alias`, `sync_interval`, `late_deduction`, `salary_cycle`, `ot_multiplier`, `business_name`, `business_address`, `business_phone`, `business_email`, `updated_at`, `standard_start_time`, `late_deduction_amount`) VALUES
(1, NULL, NULL, 4370, 'Main Entrance', 30, 1, '15 Days Cycle', 1.50, 'Nexus HRM', NULL, '', '', '2026-05-27 11:03:03', '09:00:00', 50.00);

-- --------------------------------------------------------

--
-- Table structure for table `subscriptions`
--

CREATE TABLE `subscriptions` (
  `id` bigint(20) NOT NULL,
  `company_id` bigint(20) DEFAULT NULL,
  `plan_name` varchar(100) DEFAULT NULL,
  `amount` decimal(10,2) DEFAULT NULL,
  `billing_cycle` varchar(50) DEFAULT NULL,
  `payment_status` enum('paid','pending','failed') DEFAULT 'pending',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `subscriptions`
--

INSERT INTO `subscriptions` (`id`, `company_id`, `plan_name`, `amount`, `billing_cycle`, `payment_status`, `start_date`, `end_date`, `created_at`, `updated_at`) VALUES
(1, 1, 'Free Trial', 0.00, 'monthly', 'paid', '2026-05-27', '2026-06-03', '2026-05-27 11:57:26', '2026-05-27 11:57:26'),
(2, 2, 'Free Trial', 0.00, 'monthly', 'paid', '2026-05-27', '2026-06-03', '2026-05-27 12:05:33', '2026-05-27 12:05:33'),
(3, 3, 'Free Trial', 0.00, 'monthly', 'paid', '2026-05-28', '2026-06-04', '2026-05-28 10:49:38', '2026-05-28 10:49:38'),
(4, 4, 'Free Trial', 0.00, 'monthly', 'paid', '2026-05-28', '2026-06-04', '2026-05-28 10:50:30', '2026-05-28 10:50:30');

-- --------------------------------------------------------

--
-- Table structure for table `system_logs`
--

CREATE TABLE `system_logs` (
  `id` bigint(20) NOT NULL,
  `action` varchar(255) DEFAULT NULL,
  `role` varchar(50) DEFAULT NULL,
  `user_id` bigint(20) DEFAULT NULL,
  `ip_address` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `unknown_attempts`
--

CREATE TABLE `unknown_attempts` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `photo` longtext DEFAULT NULL,
  `confidence` decimal(5,4) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `unknown_attempts`
--

INSERT INTO `unknown_attempts` (`id`, `company_id`, `photo`, `confidence`, `created_at`) VALUES
(1, NULL, NULL, 0.7090, '2026-05-29 11:16:20'),
(2, NULL, NULL, 0.7404, '2026-05-29 11:17:36'),
(3, NULL, NULL, 0.4945, '2026-05-29 11:18:10'),
(4, NULL, NULL, 0.4294, '2026-05-29 11:18:45'),
(5, NULL, NULL, 0.4626, '2026-05-29 11:29:10'),
(6, NULL, NULL, 0.5351, '2026-05-29 11:30:07'),
(7, NULL, NULL, 0.5264, '2026-05-29 11:30:44');

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `company_id` int(11) DEFAULT NULL,
  `employee_id` int(11) DEFAULT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(50) NOT NULL,
  `name` varchar(100) DEFAULT '',
  `photo` longtext DEFAULT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `company_id`, `employee_id`, `email`, `password`, `role`, `name`, `photo`, `created_by`, `created_at`) VALUES
(1, NULL, NULL, 'superadmin@biotrack.com', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lkmG', 'admin', 'System Superadmin', NULL, NULL, '2026-05-27 10:40:42'),
(2, 1, NULL, 'aza@gmail.com', '$2a$10$E6T35hgKcO2EWUG2flXa4uWIKkaylIppMqebwBrSyNipb1xcmDdta', 'admin', 'aza', NULL, NULL, '2026-05-27 11:57:26'),
(3, 2, NULL, 'aaa@gmail.com', '$2a$10$2nmap0NtpoTas1JBglbsB.fLHTnccfY19/dBwXzeL10RP9jRpQWZi', 'admin', 'aaa', NULL, NULL, '2026-05-27 12:05:33'),
(4, 3, NULL, 'abc@gmail.com', '$2a$10$9m9G/fA6rT7iwtGfOLPmmuPFF8V5e.7o24amYSyG2er6DC2vI1UL.', 'admin', 'abc', NULL, NULL, '2026-05-28 10:49:38'),
(5, 4, NULL, 'abcd@gmail.com', '$2a$10$syfKUdyqTv4lGwUt66gQbOvSdtxWxk2EGPRhRDCxSkFyhwvOCwfPC', 'admin', 'abc', NULL, NULL, '2026-05-28 10:50:30'),
(6, 4, 1, 'kknsdjn@gmail.com', '$2a$10$W3CQseCdRmUiagZmxVS9qeBOb6A1BQezNJ8QFdrRKg4Hngsf7NG7e', 'employee', 'kknsdjn111', 'http://localhost:8081/uploads/profile-1779965596433.png', 5, '2026-05-28 10:53:16'),
(7, 4, 2, 'g@gmail.com', '$2a$10$ZX17H0xZzVt9SSuhYaf0Q.PB9QeyjMivJU9PXKBnWYCGYd6M5VRsS', 'employee', 'gautam sir', NULL, 5, '2026-05-28 12:48:18');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `attendance`
--
ALTER TABLE `attendance`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_attendance` (`employee_id`,`date`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `companies`
--
ALTER TABLE `companies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `company_requests`
--
ALTER TABLE `company_requests`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `employees`
--
ALTER TABLE `employees`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `machine_id` (`machine_id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `face_embeddings`
--
ALTER TABLE `face_embeddings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_employee_face` (`employee_id`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `face_logs`
--
ALTER TABLE `face_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `employee_id` (`employee_id`);

--
-- Indexes for table `payroll`
--
ALTER TABLE `payroll`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `unique_payroll_cycle` (`employee_id`,`cycle_start`,`cycle_end`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `plans`
--
ALTER TABLE `plans`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `plan_requests`
--
ALTER TABLE `plan_requests`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `public_holidays`
--
ALTER TABLE `public_holidays`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `holiday_date` (`holiday_date`);

--
-- Indexes for table `raw_logs`
--
ALTER TABLE `raw_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_machine_user` (`machine_user_id`),
  ADD KEY `idx_punch_time` (`punch_time`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `subscriptions`
--
ALTER TABLE `subscriptions`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `system_logs`
--
ALTER TABLE `system_logs`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `unknown_attempts`
--
ALTER TABLE `unknown_attempts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `company_id` (`company_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `company_id` (`company_id`),
  ADD KEY `employee_id` (`employee_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `attendance`
--
ALTER TABLE `attendance`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `companies`
--
ALTER TABLE `companies`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `company_requests`
--
ALTER TABLE `company_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `employees`
--
ALTER TABLE `employees`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `face_embeddings`
--
ALTER TABLE `face_embeddings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `face_logs`
--
ALTER TABLE `face_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=9;

--
-- AUTO_INCREMENT for table `payroll`
--
ALTER TABLE `payroll`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `plans`
--
ALTER TABLE `plans`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=4;

--
-- AUTO_INCREMENT for table `plan_requests`
--
ALTER TABLE `plan_requests`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `public_holidays`
--
ALTER TABLE `public_holidays`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `raw_logs`
--
ALTER TABLE `raw_logs`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `subscriptions`
--
ALTER TABLE `subscriptions`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `system_logs`
--
ALTER TABLE `system_logs`
  MODIFY `id` bigint(20) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `unknown_attempts`
--
ALTER TABLE `unknown_attempts`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=8;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=10;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `attendance`
--
ALTER TABLE `attendance`
  ADD CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `attendance_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD CONSTRAINT `audit_logs_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `employees`
--
ALTER TABLE `employees`
  ADD CONSTRAINT `employees_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `face_embeddings`
--
ALTER TABLE `face_embeddings`
  ADD CONSTRAINT `face_embeddings_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `face_embeddings_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `face_logs`
--
ALTER TABLE `face_logs`
  ADD CONSTRAINT `face_logs_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `face_logs_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payroll`
--
ALTER TABLE `payroll`
  ADD CONSTRAINT `payroll_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `payroll_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `raw_logs`
--
ALTER TABLE `raw_logs`
  ADD CONSTRAINT `raw_logs_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `settings`
--
ALTER TABLE `settings`
  ADD CONSTRAINT `settings_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `unknown_attempts`
--
ALTER TABLE `unknown_attempts`
  ADD CONSTRAINT `unknown_attempts_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `users_ibfk_1` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `users_ibfk_2` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
