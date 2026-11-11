using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using WinLab.Contracts;
using Xunit;

namespace WinLab.Tests
{
    public class SecurityValidatorAdversarialTests
    {
        private static readonly char[] All16ForbiddenChars = new[]
        {
            '"', '/', '\\', '[', ']', ':', ';', '|', '=', ',', '+', '*', '?', '<', '>', '@'
        };

        // =========================================================================
        // 1. All 16 Forbidden Characters in Various Positions
        // =========================================================================

        [Theory]
        [InlineData('"')]
        [InlineData('/')]
        [InlineData('\\')]
        [InlineData('[')]
        [InlineData(']')]
        [InlineData(':')]
        [InlineData(';')]
        [InlineData('|')]
        [InlineData('=')]
        [InlineData(',')]
        [InlineData('+')]
        [InlineData('*')]
        [InlineData('?')]
        [InlineData('<')]
        [InlineData('>')]
        [InlineData('@')]
        public void ForbiddenChars_Student_RejectedInAllPositions(char c)
        {
            // Position 1: Leading
            var (v1, e1) = SecurityValidator.ValidateAccountNames($"{c}aluno", "ValidAdmin");
            Assert.False(v1);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e1);

            // Position 2: Trailing
            var (v2, e2) = SecurityValidator.ValidateAccountNames($"aluno{c}", "ValidAdmin");
            Assert.False(v2);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e2);

            // Position 3: Middle
            var (v3, e3) = SecurityValidator.ValidateAccountNames($"alu{c}no", "ValidAdmin");
            Assert.False(v3);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e3);

            // Position 4: Lone char
            var (v4, e4) = SecurityValidator.ValidateAccountNames(c.ToString(), "ValidAdmin");
            Assert.False(v4);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e4);

            // Position 5: Padded with spaces
            var (v5, e5) = SecurityValidator.ValidateAccountNames($"  {c}  ", "ValidAdmin");
            Assert.False(v5);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e5);
        }

        [Theory]
        [InlineData('"')]
        [InlineData('/')]
        [InlineData('\\')]
        [InlineData('[')]
        [InlineData(']')]
        [InlineData(':')]
        [InlineData(';')]
        [InlineData('|')]
        [InlineData('=')]
        [InlineData(',')]
        [InlineData('+')]
        [InlineData('*')]
        [InlineData('?')]
        [InlineData('<')]
        [InlineData('>')]
        [InlineData('@')]
        public void ForbiddenChars_Admin_RejectedInAllPositions(char c)
        {
            // Position 1: Leading
            var (v1, e1) = SecurityValidator.ValidateAccountNames("ValidStudent", $"{c}admin");
            Assert.False(v1);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e1);

            // Position 2: Trailing
            var (v2, e2) = SecurityValidator.ValidateAccountNames("ValidStudent", $"admin{c}");
            Assert.False(v2);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e2);

            // Position 3: Middle
            var (v3, e3) = SecurityValidator.ValidateAccountNames("ValidStudent", $"adm{c}in");
            Assert.False(v3);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e3);

            // Position 4: Lone char
            var (v4, e4) = SecurityValidator.ValidateAccountNames("ValidStudent", c.ToString());
            Assert.False(v4);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e4);

            // Position 5: Padded with spaces
            var (v5, e5) = SecurityValidator.ValidateAccountNames("ValidStudent", $"  {c}  ");
            Assert.False(v5);
            Assert.Contains("Nome de usuário contém caracteres inválidos", e5);
        }

        // =========================================================================
        // 2. Boundary Conditions for Length: 20 vs 21 chars & Pre/Post Trim
        // =========================================================================

        [Fact]
        public void LengthBoundary_Exactly20Characters_Accepted()
        {
            string exact20 = new string('x', 20);
            var (validStudent, errStudent) = SecurityValidator.ValidateAccountNames(exact20, "ValidAdmin");
            Assert.True(validStudent);
            Assert.Null(errStudent);

            var (validAdmin, errAdmin) = SecurityValidator.ValidateAccountNames("ValidStudent", exact20);
            Assert.True(validAdmin);
            Assert.Null(errAdmin);
        }

        [Fact]
        public void LengthBoundary_Exactly21Characters_Rejected()
        {
            string exact21 = new string('x', 21);
            var (validStudent, errStudent) = SecurityValidator.ValidateAccountNames(exact21, "ValidAdmin");
            Assert.False(validStudent);
            Assert.Equal("Nome de usuário não pode ter mais de 20 caracteres.", errStudent);

            var (validAdmin, errAdmin) = SecurityValidator.ValidateAccountNames("ValidStudent", exact21);
            Assert.False(validAdmin);
            Assert.Equal("Nome de usuário não pode ter mais de 20 caracteres.", errAdmin);
        }

        [Fact]
        public void LengthBoundary_LeadingAndTrailingSpaces_LengthOver20BeforeTrim_AcceptedIfTrimmed20OrLess()
        {
            // 20 chars of payload + 6 spaces = 26 chars before trim, 20 chars after trim
            string padded20 = "   12345678901234567890   ";
            Assert.Equal(26, padded20.Length);
            Assert.Equal(20, padded20.Trim().Length);

            var (validStudent, errStudent) = SecurityValidator.ValidateAccountNames(padded20, "ValidAdmin");
            Assert.True(validStudent);
            Assert.Null(errStudent);

            var (validAdmin, errAdmin) = SecurityValidator.ValidateAccountNames("ValidStudent", padded20);
            Assert.True(validAdmin);
            Assert.Null(errAdmin);
        }

        [Fact]
        public void LengthBoundary_LeadingAndTrailingSpaces_LengthOver20BeforeTrim_RejectedIfTrimmed21OrMore()
        {
            // 21 chars of payload + 6 spaces = 27 chars before trim, 21 chars after trim
            string padded21 = "   123456789012345678901   ";
            Assert.Equal(27, padded21.Length);
            Assert.Equal(21, padded21.Trim().Length);

            var (validStudent, errStudent) = SecurityValidator.ValidateAccountNames(padded21, "ValidAdmin");
            Assert.False(validStudent);
            Assert.Equal("Nome de usuário não pode ter mais de 20 caracteres.", errStudent);

            var (validAdmin, errAdmin) = SecurityValidator.ValidateAccountNames("ValidStudent", padded21);
            Assert.False(validAdmin);
            Assert.Equal("Nome de usuário não pode ter mais de 20 caracteres.", errAdmin);
        }

        // =========================================================================
        // 3. Period Names: ., .., ..., ...., .a, a., a.b
        // =========================================================================

        [Theory]
        [InlineData(".")]
        [InlineData("..")]
        [InlineData("...")]
        [InlineData("....")]
        [InlineData(". . .")]
        [InlineData("  ...  ")]
        public void PeriodNames_PeriodOnly_RejectedForStudentAndAdmin(string periodName)
        {
            var (v1, e1) = SecurityValidator.ValidateAccountNames(periodName, "ValidAdmin");
            Assert.False(v1);
            Assert.Equal("Nome de usuário não pode conter apenas pontos.", e1);

            var (v2, e2) = SecurityValidator.ValidateAccountNames("ValidStudent", periodName);
            Assert.False(v2);
            Assert.Equal("Nome de usuário não pode conter apenas pontos.", e2);
        }

        [Theory]
        [InlineData(".a")]
        [InlineData("a.")]
        [InlineData("a.b")]
        [InlineData("aluno.lab01")]
        [InlineData("user.1.2")]
        public void PeriodNames_WithValidAlphanumericCharacters_Accepted(string nameWithPeriods)
        {
            var (v1, e1) = SecurityValidator.ValidateAccountNames(nameWithPeriods, "ValidAdmin");
            Assert.True(v1);
            Assert.Null(e1);

            var (v2, e2) = SecurityValidator.ValidateAccountNames("ValidStudent", nameWithPeriods);
            Assert.True(v2);
            Assert.Null(e2);
        }

        // =========================================================================
        // 4. Whitespace-Padded Collisions
        // =========================================================================

        [Theory]
        [InlineData("Aluno ", "Aluno")]
        [InlineData("Aluno ", "aluno")]
        [InlineData("Aluno ", " Aluno ")]
        [InlineData("Aluno ", "ALUNO ")]
        [InlineData("Aluno", "Aluno ")]
        [InlineData("aluno", "Aluno ")]
        [InlineData(" Aluno ", "aluno")]
        [InlineData("ALUNO ", "Aluno")]
        [InlineData("  Aluno  ", "  ALUNO  ")]
        [InlineData("\tAluno\t", "aluno")]
        public void WhitespacePaddedCollisions_RejectedAsIdentical(string student, string admin)
        {
            var (isValid, error) = SecurityValidator.ValidateAccountNames(student, admin);
            Assert.False(isValid);
            Assert.Equal("A conta restrita não pode ser idêntica à conta de administrador.", error);
        }

        // =========================================================================
        // 5. ValidateStudentNotAdministrator Matrix
        // =========================================================================

        [Fact]
        public void ValidateStudentNotAdministrator_NullCollection_ReturnsTrue()
        {
            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("Aluno", null);
            Assert.True(isValid);
            Assert.Null(error);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_EmptyCollection_ReturnsTrue()
        {
            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("Aluno", new List<LocalUserDto>());
            Assert.True(isValid);
            Assert.Null(error);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_UserNotPresentInCollection_ReturnsTrue()
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "Admin1", IsAdmin = true },
                new LocalUserDto { Name = "Admin2", IsAdmin = true }
            };

            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("AlunoDesconhecido", accounts);
            Assert.True(isValid);
            Assert.Null(error);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_CaseMismatches_AdminDetectedAndRejected()
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "ALUNO_ADMIN", IsAdmin = true }
            };

            // Test lower-case student user matching UPPER-CASE admin account
            var (isValid1, err1) = SecurityValidator.ValidateStudentNotAdministrator("aluno_admin", accounts);
            Assert.False(isValid1);
            Assert.Contains("possui privilégios de Administrador", err1);

            // Test mixed-case with spaces
            var (isValid2, err2) = SecurityValidator.ValidateStudentNotAdministrator("  Aluno_Admin  ", accounts);
            Assert.False(isValid2);
            Assert.Contains("possui privilégios de Administrador", err2);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_MatchingUserWithIsAdminFalse_ReturnsTrue()
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "AlunoPadrao", IsAdmin = false }
            };

            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("AlunoPadrao", accounts);
            Assert.True(isValid);
            Assert.Null(error);

            // Case and space tolerance for standard user
            var (isValidPadded, errPadded) = SecurityValidator.ValidateStudentNotAdministrator("  alunopadrao  ", accounts);
            Assert.True(isValidPadded);
            Assert.Null(errPadded);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_MatchingUserWithIsAdminTrue_ReturnsFalseWithError()
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "Aluno", IsAdmin = true }
            };

            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("Aluno", accounts);
            Assert.False(isValid);
            Assert.Equal("A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador.", error);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_CollectionWithNullElementsAndNullNames_HandlesGracefully()
        {
            var accounts = new List<LocalUserDto?>
            {
                null,
                new LocalUserDto { Name = null!, IsAdmin = true },
                new LocalUserDto { Name = "", IsAdmin = true },
                new LocalUserDto { Name = "   ", IsAdmin = true },
                new LocalUserDto { Name = "ValidStudent", IsAdmin = false }
            };

            // Non-admin student should succeed despite nulls and empty names in collection
            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("ValidStudent", accounts!);
            Assert.True(isValid);
            Assert.Null(error);

            // User not matching anything in corrupt collection should safely return true
            var (isValid2, error2) = SecurityValidator.ValidateStudentNotAdministrator("NonExistent", accounts!);
            Assert.True(isValid2);
            Assert.Null(error2);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData("\t")]
        [InlineData("\r\n")]
        public void ValidateStudentNotAdministrator_NullOrWhitespaceStudent_ReturnsTrue(string? invalidStudent)
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "Administrador", IsAdmin = true }
            };

            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator(invalidStudent, accounts);
            Assert.True(isValid);
            Assert.Null(error);
        }

        // =========================================================================
        // 6. Concurrency and Stress Invariants
        // =========================================================================

        [Fact]
        public void ConcurrentValidation_1000Threads_MaintainsThreadSafetyAndConsistency()
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "AdminLocal", IsAdmin = true },
                new LocalUserDto { Name = "AlunoComum", IsAdmin = false }
            };

            Parallel.For(0, 1000, i =>
            {
                if (i % 2 == 0)
                {
                    var (valid, err) = SecurityValidator.ValidateStudentNotAdministrator("AdminLocal", accounts);
                    Assert.False(valid);
                    Assert.NotNull(err);
                }
                else
                {
                    var (valid, err) = SecurityValidator.ValidateStudentNotAdministrator("AlunoComum", accounts);
                    Assert.True(valid);
                    Assert.Null(err);
                }

                var (validAccts, errAccts) = SecurityValidator.ValidateAccountNames("Aluno", "Administrador");
                Assert.True(validAccts);
                Assert.Null(errAccts);
            });
        }
    }
}
