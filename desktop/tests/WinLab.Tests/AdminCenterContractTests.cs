using System;
using System.Text.Json;
using WinLab.Contracts;
using WinLab.Contracts.Administration;
using Xunit;

namespace WinLab.Tests;

public class AdminCenterContractTests
{
    [Theory]
    [InlineData("admin.accounts.query", false)]
    [InlineData("admin.accounts.preview", false)]
    [InlineData("admin.accounts.apply", true)]
    [InlineData("admin.diagnostics.query", false)]
    [InlineData("admin.permissions.query", false)]
    [InlineData("admin.permissions.preview", false)]
    [InlineData("admin.permissions.apply", true)]
    public void AdministrationActionsAreAllowlistedWithExplicitOperationType(string action, bool mutation)
    {
        Assert.Contains(action, IpcConstants.AllowedActions);
        Assert.True(AdminActions.Contains(action));
        Assert.Equal(mutation, AdminActions.IsMutation(action));
    }

    [Fact]
    public void PreviewPublishesObservedAndProposedAccountWithRevision()
    {
        var before = new AdminAccountDto("aluno", "S-1-5-21-1-2-3-1001", true, "Student", "StandardUser", false, []);
        var preview = new AdminAccountPreviewDto(new string('A', 64), "Machine", before,
            before with { Enabled = false }, true, []);

        var json = JsonSerializer.SerializeToElement(preview, new JsonSerializerOptions(JsonSerializerDefaults.Web));

        Assert.True(json.GetProperty("before").GetProperty("enabled").GetBoolean());
        Assert.False(json.GetProperty("after").GetProperty("enabled").GetBoolean());
        Assert.Equal(64, json.GetProperty("revision").GetString()?.Length);
        Assert.False(json.TryGetProperty("password", out _));
    }
}
